# Release the TypeScript SDK

The public package is `@rivetplane/sdk`. The `rivetplane` package name stays with the local CLI.

## One-time npm setup

1. Create the `@rivetplane` npm organization and give the maintainers publish access.
2. Create a protected GitHub environment named `npm` in `rivetplane/typescript-sdk`.
3. For the first release, add a short-lived granular npm token as the `NPM_TOKEN` environment secret.
4. After the first release, configure an npm trusted publisher for repository `rivetplane/typescript-sdk`, workflow `publish.yml`, and environment `npm`.
5. Delete the GitHub secret and revoke the bootstrap token. Later releases use GitHub OIDC and npm provenance.

## Release procedure

1. Update the version in `package.json`.
2. Merge the change after CI passes.
3. Create and push a signed tag that exactly matches the package version:

```sh
git tag -s sdk-v0.1.1 -m "@rivetplane/sdk 0.1.1"
git push origin sdk-v0.1.1
```

The workflow checks the tag and version, runs tests in supported runtimes, checks browser bundling, installs the tarball in a clean consumer project, and publishes with provenance.
