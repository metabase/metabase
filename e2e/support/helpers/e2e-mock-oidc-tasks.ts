import http from "node:http";

let server: http.Server | null = null;

type MockOidcServerOptions = {
  port: number;
};

/** Start a mock OIDC identity provider that answers the backend's connection check. */
export function startMockOidcServer({
  port,
}: MockOidcServerOptions): Promise<null> {
  return new Promise((resolve, reject) => {
    if (server) {
      server.close();
      server = null;
    }

    const issuer = `http://localhost:${port}`;

    server = http.createServer((req, res) => {
      if (
        req.method === "GET" &&
        req.url === "/.well-known/openid-configuration"
      ) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            issuer,
            authorization_endpoint: `${issuer}/authorize`,
            token_endpoint: `${issuer}/token`,
            jwks_uri: `${issuer}/jwks`,
          }),
        );
        return;
      }

      if (req.method === "POST" && req.url === "/token") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            access_token: "mock-access-token",
            token_type: "Bearer",
          }),
        );
        return;
      }

      res.writeHead(404);
      res.end();
    });

    server.on("error", reject);
    server.listen(port, () => resolve(null));
  });
}

export function stopMockOidcServer(): Promise<null> {
  return new Promise((resolve) => {
    if (server) {
      server.close(() => resolve(null));
      server = null;
    } else {
      resolve(null);
    }
  });
}
