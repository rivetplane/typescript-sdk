import { Rivetplane } from "@rivetplane/sdk";

const client = new Rivetplane({
  ...(process.env.RIVETPLANE_URL ? { baseUrl: process.env.RIVETPLANE_URL } : {}),
  authentication: process.env.RIVETPLANE_TOKEN ?? "",
});

for await (const event of client.events()) {
  console.log(event.type, event.machine_id, event.session_id, event.data);
}
