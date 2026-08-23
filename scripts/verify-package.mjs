import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const packageDirectory = resolve(import.meta.dirname, "..");
const temporaryDirectory = mkdtempSync(join(tmpdir(), "rivetplane-sdk-"));

try {
  execFileSync("npm", ["run", "build"], { cwd: packageDirectory, stdio: "inherit" });
  const output = execFileSync("npm", ["pack", "--json", "--pack-destination", temporaryDirectory], { cwd: packageDirectory, encoding: "utf8" });
  const [{ filename, files, size }] = JSON.parse(output);
  const paths = new Set(files.map((file) => file.path));
  for (const required of ["dist/index.js", "dist/index.d.ts", "README.md", "LICENSE", "package.json"]) {
    if (!paths.has(required)) throw new Error(`SDK tarball is missing ${required}`);
  }
  if ([...paths].some((path) => path.includes(".test.") || path.includes("browser-check"))) throw new Error("SDK tarball contains verification output");
  const installDirectory = join(temporaryDirectory, "consumer");
  mkdirSync(installDirectory);
  execFileSync("npm", ["init", "-y"], { cwd: installDirectory, stdio: "ignore" });
  execFileSync("npm", ["install", "--ignore-scripts", join(temporaryDirectory, filename)], { cwd: installDirectory, stdio: "inherit" });
  execFileSync("node", ["--input-type=module", "--eval", "import { Rivetplane } from '@rivetplane/sdk'; const sdk = new Rivetplane({baseUrl:'https://example.test', authentication:'test'}); if (!sdk.sessions || !sdk.machines || !sdk.harnesses) process.exit(1)"], { cwd: installDirectory, stdio: "inherit" });
  const metadata = JSON.parse(readFileSync(join(packageDirectory, "package.json"), "utf8"));
  console.log(`Verified ${metadata.name}@${metadata.version}: ${size} bytes and ${files.length} files in ${filename}`);
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
