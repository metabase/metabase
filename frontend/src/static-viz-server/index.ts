import { serve } from "@hono/node-server";

import { app } from "./app";

const HOST = process.env.HOST ?? "0.0.0.0";
const PORT = Number(process.env.PORT ?? 3000);

const server = serve(
  { fetch: app.fetch, hostname: HOST, port: PORT },
  (info) => {
    console.log(`Server listening on ${info.address}:${info.port}`);
  },
);

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
