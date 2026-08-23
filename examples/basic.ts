import { Rivetplane, RivetplaneApiError } from "@rivetplane/sdk";

const client = new Rivetplane({
  baseUrl: process.env.RIVETPLANE_URL ?? "http://127.0.0.1:8080",
  authentication: process.env.RIVETPLANE_TOKEN ?? "",
});

try {
  const sessions = await client.sessions.list();
  console.log(sessions);
} catch (error) {
  if (error instanceof RivetplaneApiError) console.error(error.status, error.body);
  else throw error;
}
