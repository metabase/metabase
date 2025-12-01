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
    const encodedParameters = JSON.stringify(parameters);

    describe("adhoc query", () => {
      it("should generate url for adhoc query", () => {
        const datasetQuery: JsonQuery = {
          database: 1,
          type: "query",
          query: { "source-table": 1 },
        } as JsonQuery;
        const encodedQuery = JSON.stringify(datasetQuery);

        const url = getTileUrl({
          zoom,
          coord,
          latField,
          lonField,
          datasetQuery,
        });

        expect(url).toBe(
          `/api/tiles/${zoom}/${coord.x}/${coord.y}?query=${encodeURIComponent(encodedQuery)}&latField=${encodeURIComponent(latField)}&lonField=${encodeURIComponent(lonField)}`,
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
          `/api/tiles/123/${zoom}/${coord.x}/${coord.y}?latField=${encodeURIComponent(latField)}&lonField=${encodeURIComponent(lonField)}`,
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
          `/api/tiles/123/${zoom}/${coord.x}/${coord.y}?latField=${encodeURIComponent(latField)}&lonField=${encodeURIComponent(lonField)}&parameters=${encodeURIComponent(encodedParameters)}`,
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
          `/api/tiles/10/dashcard/20/card/30/${zoom}/${coord.x}/${coord.y}?latField=${encodeURIComponent(latField)}&lonField=${encodeURIComponent(lonField)}`,
        );
      });

      it("should handle an x-ray dashboard", () => {
        const datasetQuery: JsonQuery = {
          database: 1,
          type: "query",
          query: { "source-table": 1 },
        } as JsonQuery;
        const encodedQuery = JSON.stringify(datasetQuery);

        const url = getTileUrl({
          dashboardId: "/auto/dashboard/table/5",
          dashcardId: 20,
          cardId: 30,
          zoom,
          coord,
          latField,
          lonField,
          datasetQuery,
        });

        expect(url).toBe(
          `/api/tiles/${zoom}/${coord.x}/${coord.y}?query=${encodeURIComponent(encodedQuery)}&latField=${encodeURIComponent(latField)}&lonField=${encodeURIComponent(lonField)}`,
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
          `/api/tiles/10/dashcard/20/card/30/${zoom}/${coord.x}/${coord.y}?latField=${encodeURIComponent(latField)}&lonField=${encodeURIComponent(lonField)}&parameters=${encodeURIComponent(encodedParameters)}`,
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
          `/api/public/tiles/card/abc-123/${zoom}/${coord.x}/${coord.y}?latField=${encodeURIComponent(latField)}&lonField=${encodeURIComponent(lonField)}`,
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
          `/api/public/tiles/card/abc-123/${zoom}/${coord.x}/${coord.y}?latField=${encodeURIComponent(latField)}&lonField=${encodeURIComponent(lonField)}&parameters=${encodeURIComponent(encodedParameters)}`,
        );
      });
    });

    describe("public dashboard", () => {
      it("should generate url for public dashboard without parameters", () => {
        const url = getTileUrl({
          // public dashboards have a uuid instead of an id
          dashboardId: "621efc8c-9fd9-42db-a39a-1abdbfe23937",
          dashcardId: 20,
          cardId: 30,
          zoom,
          coord,
          latField,
          lonField,
          uuid: "abc-123",
        });

        expect(url).toBe(
          `/api/public/tiles/dashboard/abc-123/dashcard/20/card/30/${zoom}/${coord.x}/${coord.y}?latField=${encodeURIComponent(latField)}&lonField=${encodeURIComponent(lonField)}`,
        );
      });

      it("should generate url for public dashboard with parameters", () => {
        const datasetResult = createMockDataset({
          json_query: {
            parameters,
          } as JsonQuery,
        });

        const url = getTileUrl({
          // public dashboards have a uuid instead of an id
          dashboardId: "621efc8c-9fd9-42db-a39a-1abdbfe23937",
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
          `/api/public/tiles/dashboard/abc-123/dashcard/20/card/30/${zoom}/${coord.x}/${coord.y}?latField=${encodeURIComponent(latField)}&lonField=${encodeURIComponent(lonField)}&parameters=${encodeURIComponent(encodedParameters)}`,
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
          `/api/embed/tiles/card/embed-token/${zoom}/${coord.x}/${coord.y}?latField=${encodeURIComponent(latField)}&lonField=${encodeURIComponent(lonField)}`,
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

        const expectedParameters = JSON.stringify([
          { id: "original", value: "original" },
        ]);

        expect(url).toBe(
          `/api/embed/tiles/card/embed-token/${zoom}/${coord.x}/${coord.y}?latField=${encodeURIComponent(latField)}&lonField=${encodeURIComponent(lonField)}&parameters=${encodeURIComponent(expectedParameters)}`,
        );
      });

      it("should generate url for embed question with isEmbedPreview=true", () => {
        const url = getTileUrl({
          cardId: 123,
          zoom,
          coord,
          latField,
          lonField,
          token: "embed-token",
          isEmbedPreview: true,
        });

        expect(url).toBe(
          `/api/preview_embed/tiles/card/embed-token/${zoom}/${coord.x}/${coord.y}?latField=${encodeURIComponent(latField)}&lonField=${encodeURIComponent(lonField)}`,
        );
      });

      it("should generate url for embed question with isEmbedPreview=false", () => {
        const url = getTileUrl({
          cardId: 123,
          zoom,
          coord,
          latField,
          lonField,
          token: "embed-token",
          isEmbedPreview: false,
        });

        expect(url).toBe(
          `/api/embed/tiles/card/embed-token/${zoom}/${coord.x}/${coord.y}?latField=${encodeURIComponent(latField)}&lonField=${encodeURIComponent(lonField)}`,
        );
      });
    });

    describe("embed dashboard", () => {
      const jwt = "th1s-l00ks-lik3.a-jwt-t0k3n.bu7-1s-n07"; // embedded dashboards have a JWT instead of an id

      it("should generate url for embed dashboard without parameters", () => {
        const url = getTileUrl({
          // embedded dashboards have a JWT instead of an id
          dashboardId: jwt,
          dashcardId: 20,
          cardId: 30,
          zoom,
          coord,
          latField,
          lonField,
          token: "embed-token",
        });

        expect(url).toBe(
          `/api/embed/tiles/dashboard/embed-token/dashcard/20/card/30/${zoom}/${coord.x}/${coord.y}?latField=${encodeURIComponent(latField)}&lonField=${encodeURIComponent(lonField)}`,
        );
      });

      it("should generate url for embed dashboard with parameters", () => {
        const datasetResult = createMockDataset({
          json_query: {
            parameters: [{ id: "original", value: "original" }],
          } as JsonQuery,
        });

        const url = getTileUrl({
          dashboardId: jwt,
          dashcardId: 20,
          cardId: 30,
          zoom,
          coord,
          latField,
          lonField,
          token: "embed-token",
          datasetResult,
        });

        const expectedParameters = JSON.stringify([
          { id: "original", value: "original" },
        ]);

        expect(url).toBe(
          `/api/embed/tiles/dashboard/embed-token/dashcard/20/card/30/${zoom}/${coord.x}/${coord.y}?latField=${encodeURIComponent(latField)}&lonField=${encodeURIComponent(lonField)}&parameters=${encodeURIComponent(expectedParameters)}`,
        );
      });

      it("should generate url for embed dashboard with isEmbedPreview=true", () => {
        const url = getTileUrl({
          dashboardId: jwt,
          dashcardId: 20,
          cardId: 30,
          zoom,
          coord,
          latField,
          lonField,
          token: "embed-token",
          isEmbedPreview: true,
        });

        expect(url).toBe(
          `/api/preview_embed/tiles/dashboard/embed-token/dashcard/20/card/30/${zoom}/${coord.x}/${coord.y}?latField=${encodeURIComponent(latField)}&lonField=${encodeURIComponent(lonField)}`,
        );
      });

      it("should generate url for embed dashboard with isEmbedPreview=false", () => {
        const url = getTileUrl({
          dashboardId: jwt,
          dashcardId: 20,
          cardId: 30,
          zoom,
          coord,
          latField,
          lonField,
          token: "embed-token",
          isEmbedPreview: false,
        });

        expect(url).toBe(
          `/api/embed/tiles/dashboard/embed-token/dashcard/20/card/30/${zoom}/${coord.x}/${coord.y}?latField=${encodeURIComponent(latField)}&lonField=${encodeURIComponent(lonField)}`,
        );
      });
    });
  });
});
