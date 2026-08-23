import { Rivetplane } from "@rivetplane/sdk";

const client = new Rivetplane({
  baseUrl: process.env.RIVETPLANE_URL ?? "http://127.0.0.1:8080",
  authentication: process.env.RIVETPLANE_TOKEN ?? "",
});

for await (const event of client.events()) {
  console.log(event.type, event.machine_id, event.session_id, event.data);
}
