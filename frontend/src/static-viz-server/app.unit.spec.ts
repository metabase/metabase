import type { RawSeries } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks";

import { app } from "./app";

// Exercises the real HTTP app end to end — actual chart/color rendering, no stubs.

const rawSeries: RawSeries = [
  {
    card: createMockCard({
      display: "bar",
      visualization_settings: {
        "graph.dimensions": ["x"],
        "graph.metrics": ["y"],
      },
    }),
    data: createMockDatasetData({
      cols: [
        createMockColumn({
          name: "x",
          display_name: "x",
          base_type: "type/Text",
        }),
        createMockColumn({
          name: "y",
          display_name: "y",
          base_type: "type/Integer",
        }),
      ],
      rows: [
        ["a", 1],
        ["b", 2],
      ],
    }),
  },
];

const chartRequest = {
  rawSeries,
  dashcardSettings: {},
  options: {
    applicationColors: {},
    customFormatting: {},
    startOfWeek: 1,
    tokenFeatures: {},
  },
};

function post(path: string, body: unknown) {
  return app.request(path, {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("static-viz-server app", () => {
  it("GET /api/v1/health returns ok", async () => {
    const res = await app.request("/api/v1/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("POST /api/v1/chart renders an SVG", async () => {
    const res = await post("/api/v1/chart", chartRequest);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.type).toBe("svg");
    expect(body.content).toContain("<svg");
  });

  it("POST /api/v1/cell-background-colors returns one color per cell", async () => {
    const res = await post("/api/v1/cell-background-colors", {
      rows: [
        ["a", 1],
        ["b", 2],
      ],
      cols: [createMockColumn({ name: "x" }), createMockColumn({ name: "y" })],
      settings: {
        "table.column_formatting": [
          {
            columns: ["y"],
            type: "single",
            operator: ">",
            value: 1,
            color: "#ff0000",
          },
        ],
      },
      cells: [
        [1, 0, "y"],
        [2, 1, "y"],
      ],
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([null, "rgba(255, 0, 0, 0.65)"]);
  });

  it("returns 404 for an unknown route", async () => {
    const res = await post("/api/v1/nope", {});
    expect(res.status).toBe(404);
  });

  it("returns 404 for the wrong method", async () => {
    const res = await app.request("/api/v1/chart");
    expect(res.status).toBe(404);
  });

  it("returns 500 on malformed JSON", async () => {
    const res = await post("/api/v1/chart", "not json");
    expect(res.status).toBe(500);
  });
});
