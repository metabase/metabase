import { serve } from "@hono/node-server";

// The polyfill installs the browser-like globals (document, window, ResizeObserver, …) the rendering
// code needs but Node doesn't provide; it must load before ./app pulls in metabase/static-viz.
import "metabase/static-viz/polyfill";

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
