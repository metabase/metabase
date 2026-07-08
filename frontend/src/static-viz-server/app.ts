import { type ServerResponse, createServer } from "http";

import { getCellBackgroundColors, visualization } from "metabase/static-viz";

type Handler = (rawBody: string) => string;

const routes: Record<string, Handler> = {
  "/api/v1/visualization": (rawBody) => visualization(rawBody),
  "/api/v1/cell-background-colors": (rawBody) => {
    const { rows, cols, settings, cells } = JSON.parse(rawBody);
    return getCellBackgroundColors(
      JSON.stringify(rows),
      JSON.stringify(cols),
      JSON.stringify(settings),
      JSON.stringify(cells),
    );
  },
};

const PORT = Number(process.env.PORT ?? 3000);

function send(res: ServerResponse, status: number, body: string) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(body);
}

const server = createServer((req, res) => {
  const handler = req.method === "POST" ? routes[req.url ?? ""] : undefined;
  if (!handler) {
    send(
      res,
      404,
      JSON.stringify({ error: `no route for ${req.method} ${req.url}` }),
    );
    return;
  }
  let raw = "";
  req.on("data", (chunk) => {
    raw += chunk;
  });
  req.on("end", () => {
    try {
      send(res, 200, handler(raw));
    } catch {
      send(res, 500, "");
    }
  });
});

server.listen(PORT, () => {
  console.log(`static-viz server listening on port ${PORT}`);
});
