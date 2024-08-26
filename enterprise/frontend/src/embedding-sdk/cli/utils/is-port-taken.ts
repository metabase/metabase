import { type Server, createServer } from "net";

/**
 * Check if a port is taken.
 * Creates a TCP server on the given port and waits for it to be closed.
 */
export const checkIsPortTaken = (port: number) =>
  new Promise<boolean>((resolve, reject) => {
    const server: Server = createServer()
      .once("error", (err: NodeJS.ErrnoException) =>
        err.code === "EADDRINUSE" ? resolve(true) : reject(err),
      )
      .once("listening", () =>
        server.once("close", () => resolve(false)).close(),
      )
      .listen(port);
  });
