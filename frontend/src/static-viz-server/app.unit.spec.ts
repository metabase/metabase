import type { RawSeries } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks";

import { app } from "./app";

function post(path: string, body: unknown) {
  return app.request(path, {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("static-viz-server app", () => {
  it("GET /api/v1/health returns ok", async () => {
    const response = await app.request("/api/v1/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("POST /api/v1/chart renders an SVG", async () => {
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

    const request = {
      rawSeries,
      dashcardSettings: {},
      options: {
        applicationColors: {},
        customFormatting: {},
        startOfWeek: 1,
        tokenFeatures: {},
      },
    };

    const response = await post("/api/v1/chart", request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.type).toBe("svg");
    expect(body.content).toContain("<svg");
  });

  it("POST /api/v1/cell-background-colors returns one color per cell", async () => {
    const request = {
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
    };

    const response = await post("/api/v1/cell-background-colors", request);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([null, "rgba(255, 0, 0, 0.65)"]);
  });

  it("returns 404 for an unknown route", async () => {
    const response = await post("/api/v1/nope", {});
    expect(response.status).toBe(404);
  });

  it("returns 404 for the wrong method", async () => {
    const response = await app.request("/api/v1/chart");
    expect(response.status).toBe(404);
  });

  it("returns 500 on malformed JSON", async () => {
    const response = await post("/api/v1/chart", "not json");
    expect(response.status).toBe(500);
  });
});
