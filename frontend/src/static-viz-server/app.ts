import { Hono } from "hono";

import {
  type CellBackgroundColorsInput,
  type RenderChartInput,
  getCellBackgroundColors,
  renderChart,
} from "metabase/static-viz";

export const app = new Hono();

app.get("/api/v1/health", (c) => c.json({ status: "ok" }));

app.post("/api/v1/chart", async (c) =>
  c.json(renderChart(await c.req.json<RenderChartInput>())),
);

app.post("/api/v1/cell-background-colors", async (c) =>
  c.json(
    getCellBackgroundColors(await c.req.json<CellBackgroundColorsInput>()),
  ),
);

app.onError((_err, c) => c.body(null, 500));
