import { createServer } from "net";

/**
 * Check if a port is taken.
 * Creates a TCP server on the given port and waits for it to be closed.
 *
 * @param {number} port
 */
export const checkIsPortTaken = port =>
  new Promise((resolve, reject) => {
    const server = createServer()
      .once("error", err =>
        err.code === "EADDRINUSE" ? resolve(true) : reject(err),
      )
      .once("listening", () =>
        server.once("close", () => resolve(false)).close(),
      )
      .listen(port);
  });
