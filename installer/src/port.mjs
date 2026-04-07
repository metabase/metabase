import { createServer } from "node:net";

function tryBind(port, host) {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.unref();
    srv.on("error", () => resolve(false));
    srv.listen({ port, host }, () => srv.close(() => resolve(true)));
  });
}

// NOTE: There is an inherent TOCTOU race between checking port availability
// here and Metabase actually binding the port. Another process may claim the
// port in between. This is a known limitation of port-scanning approaches.
export async function findFreePort(start = 3000, end = 3100) {
  for (let p = start; p <= end; p++) {
    // Check both v4 and v6 wildcards so we don't collide with an existing
    // listener bound to the other family.
    if ((await tryBind(p, "0.0.0.0")) && (await tryBind(p, "::"))) return p;
  }
  throw new Error(`No free port found in range ${start}-${end}`);
}
