import type { JsonQuery } from "metabase-types/api";
import { createMockDataset } from "metabase-types/api/mocks/dataset";

import { getTileUrl } from "./map";

describe("map", () => {
  describe("getTileUrl", () => {
    const coord = { x: "{x}", y: "{y}" };
    const zoom = "{z}";
    const latField = "latitude";
    const lonField = "longitude";
    const parameters = [{ id: "param1", value: "value1" }];
    const encodedParameters = encodeURIComponent(JSON.stringify(parameters));

    describe("adhoc query", () => {
      it("should generate url for adhoc query", () => {
        const datasetQuery: JsonQuery = {
          database: 1,
          type: "query",
          query: { "source-table": 1 },
        } as JsonQuery;
        const encodedQuery = encodeURIComponent(JSON.stringify(datasetQuery));

        const url = getTileUrl({
          zoom,
          coord,
          latField,
          lonField,
          datasetQuery,
        });

        expect(url).toBe(
          `/api/tiles/${zoom}/${coord.x}/${coord.y}/${latField}/${lonField}?query=${encodedQuery}`,
        );
      });
    });

    describe("saved question", () => {
      it("should generate url for saved question without parameters", () => {
        const url = getTileUrl({
          cardId: 123,
          zoom,
          coord,
          latField,
          lonField,
        });

        expect(url).toBe(
          `/api/tiles/123/${zoom}/${coord.x}/${coord.y}/${latField}/${lonField}`,
        );
      });

      it("should generate url for saved question with parameters", () => {
        const datasetResult = createMockDataset({
          json_query: {
            parameters,
          } as JsonQuery,
        });

        const url = getTileUrl({
          cardId: 123,
          zoom,
          coord,
          latField,
          lonField,
          datasetResult,
        });

        expect(url).toBe(
          `/api/tiles/123/${zoom}/${coord.x}/${coord.y}/${latField}/${lonField}?parameters=${encodedParameters}`,
        );
      });
    });

    describe("dashboard", () => {
      it("should generate url for dashboard without parameters", () => {
        const url = getTileUrl({
          dashboardId: 10,
          dashcardId: 20,
          cardId: 30,
          zoom,
          coord,
          latField,
          lonField,
        });

        expect(url).toBe(
          `/api/tiles/10/dashcard/20/card/30/${zoom}/${coord.x}/${coord.y}/${latField}/${lonField}`,
        );
      });

      it("should generate url for dashboard with parameters", () => {
        const datasetResult = createMockDataset({
          json_query: {
            parameters,
          } as JsonQuery,
        });

        const url = getTileUrl({
          dashboardId: 10,
          dashcardId: 20,
          cardId: 30,
          zoom,
          coord,
          latField,
          lonField,
          datasetResult,
        });

        expect(url).toBe(
          `/api/tiles/10/dashcard/20/card/30/${zoom}/${coord.x}/${coord.y}/${latField}/${lonField}?parameters=${encodedParameters}`,
        );
      });
    });

    describe("public question", () => {
      it("should generate url for public question without parameters", () => {
        const url = getTileUrl({
          cardId: 123,
          zoom,
          coord,
          latField,
          lonField,
          uuid: "abc-123",
        });

        expect(url).toBe(
          `/api/public/tiles/card/abc-123/${zoom}/${coord.x}/${coord.y}/${latField}/${lonField}`,
        );
      });

      it("should generate url for public question with parameters", () => {
        const datasetResult = createMockDataset({
          json_query: {
            parameters,
          } as JsonQuery,
        });

        const url = getTileUrl({
          cardId: 123,
          zoom,
          coord,
          latField,
          lonField,
          uuid: "abc-123",
          datasetResult,
        });

        expect(url).toBe(
          `/api/public/tiles/card/abc-123/${zoom}/${coord.x}/${coord.y}/${latField}/${lonField}?parameters=${encodedParameters}`,
        );
      });
    });

    describe("public dashboard", () => {
      it("should generate url for public dashboard without parameters", () => {
        const url = getTileUrl({
          dashboardId: 10,
          dashcardId: 20,
          cardId: 30,
          zoom,
          coord,
          latField,
          lonField,
          uuid: "abc-123",
        });

        expect(url).toBe(
          `/api/public/tiles/dashboard/abc-123/dashcard/20/card/30/${zoom}/${coord.x}/${coord.y}/${latField}/${lonField}`,
        );
      });

      it("should generate url for public dashboard with parameters", () => {
        const datasetResult = createMockDataset({
          json_query: {
            parameters,
          } as JsonQuery,
        });

        const url = getTileUrl({
          dashboardId: 10,
          dashcardId: 20,
          cardId: 30,
          zoom,
          coord,
          latField,
          lonField,
          uuid: "abc-123",
          datasetResult,
        });

        expect(url).toBe(
          `/api/public/tiles/dashboard/abc-123/dashcard/20/card/30/${zoom}/${coord.x}/${coord.y}/${latField}/${lonField}?parameters=${encodedParameters}`,
        );
      });
    });

    describe("embed question", () => {
      it("should generate url for embed question without parameters", () => {
        const url = getTileUrl({
          cardId: 123,
          zoom,
          coord,
          latField,
          lonField,
          token: "embed-token",
        });

        expect(url).toBe(
          `/api/embed/tiles/card/embed-token/${zoom}/${coord.x}/${coord.y}/${latField}/${lonField}`,
        );
      });

      it("should generate url for embed question with parameters", () => {
        const datasetResult = createMockDataset({
          json_query: {
            parameters: [{ id: "original", value: "original" }],
          } as JsonQuery,
        });

        const url = getTileUrl({
          cardId: 123,
          zoom,
          coord,
          latField,
          lonField,
          token: "embed-token",
          datasetResult,
        });

        const expectedParameters = encodeURIComponent(
          JSON.stringify([{ id: "original", value: "original" }]),
        );

        expect(url).toBe(
          `/api/embed/tiles/card/embed-token/${zoom}/${coord.x}/${coord.y}/${latField}/${lonField}?parameters=${expectedParameters}`,
        );
      });
    });

    describe("embed dashboard", () => {
      it("should generate url for embed dashboard without parameters", () => {
        const url = getTileUrl({
          dashboardId: 10,
          dashcardId: 20,
          cardId: 30,
          zoom,
          coord,
          latField,
          lonField,
          token: "embed-token",
        });

        expect(url).toBe(
          `/api/embed/tiles/dashboard/embed-token/dashcard/20/card/30/${zoom}/${coord.x}/${coord.y}/${latField}/${lonField}`,
        );
      });

      it("should generate url for embed dashboard with parameters", () => {
        const datasetResult = createMockDataset({
          json_query: {
            parameters: [{ id: "original", value: "original" }],
          } as JsonQuery,
        });

        const url = getTileUrl({
          dashboardId: 10,
          dashcardId: 20,
          cardId: 30,
          zoom,
          coord,
          latField,
          lonField,
          token: "embed-token",
          datasetResult,
        });

        const expectedParameters = encodeURIComponent(
          JSON.stringify([{ id: "original", value: "original" }]),
        );

        expect(url).toBe(
          `/api/embed/tiles/dashboard/embed-token/dashcard/20/card/30/${zoom}/${coord.x}/${coord.y}/${latField}/${lonField}?parameters=${expectedParameters}`,
        );
      });
    });
  });
});
