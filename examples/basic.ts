import { Rivetplane, RivetplaneApiError } from "@rivetplane/sdk";

const client = new Rivetplane({
  ...(process.env.RIVETPLANE_URL ? { baseUrl: process.env.RIVETPLANE_URL } : {}),
  authentication: process.env.RIVETPLANE_TOKEN ?? "",
});

try {
  const sessions = await client.listSessions();
  for (const session of sessions) {
    console.log(session.id, session.title, session.model, session.agent, session.read_only, session.metadata);
  }

  if (sessions[0]) console.log(await client.getSession(sessions[0].id));

  const pending = await client.listPending({ includeNonActionable: true });
  for (const item of pending) {
    console.log(item.pending.id, item.title, item.model, item.agent, item.read_only, item.metadata);
  }

  const usage = await client.getUsage({ from: new Date(Date.now() - 86_400_000).toISOString() });
  console.log(usage.totals.tokens, usage.totals.cost.status, usage.totals.cost.amount);
} catch (error) {
  if (error instanceof RivetplaneApiError) console.error(error.status, error.body);
  else throw error;
}
