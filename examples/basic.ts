import { Rivetplane, RivetplaneApiError } from "@rivetplane/sdk";

const client = new Rivetplane({
  ...(process.env.RIVETPLANE_URL ? { baseUrl: process.env.RIVETPLANE_URL } : {}),
  authentication: process.env.RIVETPLANE_TOKEN ?? "",
});

try {
  const sessions = await client.sessions.list();
  console.log(sessions);
} catch (error) {
  if (error instanceof RivetplaneApiError) console.error(error.status, error.body);
  else throw error;
}
