import { createMockDataset } from "metabase-types/api/mocks";

import { getChartError } from "./utils";

const RAW_ERROR =
  "ORDER BY does not support expressions of type ARRAY<STRING> at [1:198]";

const GENERIC = {
  message: "There was a problem displaying this chart.",
  icon: "warning",
};
const PERMISSION = {
  message: "Sorry, you don't have permission to see this card.",
  icon: "key",
};

describe("getChartError", () => {
  it("returns undefined for a successful dataset", () => {
    expect(getChartError(createMockDataset(), undefined)).toBeUndefined();
  });

  it("returns undefined while the query is loading", () => {
    expect(getChartError(undefined, undefined)).toBeUndefined();
  });

  describe("failed request", () => {
    it("shows the generic message with the database error as details", () => {
      expect(
        getChartError(undefined, {
          status: 400,
          data: { status: "failed", error: RAW_ERROR },
        }),
      ).toEqual({ ...GENERIC, details: RAW_ERROR });
    });

    it("shows a curated error as the message, without details", () => {
      expect(
        getChartError(undefined, {
          status: 400,
          data: { error: "Column FOO does not exist", error_is_curated: true },
        }),
      ).toEqual({ message: "Column FOO does not exist", icon: "warning" });
    });

    it("shows the permission message for a 403", () => {
      expect(
        getChartError(undefined, {
          status: 403,
          data: { error: "You do not have permissions to run this query." },
        }),
      ).toEqual(PERMISSION);
    });

    it("does not offer details for a non-query error such as a gateway page", () => {
      expect(
        getChartError(undefined, { status: 504, data: "<html>Timeout</html>" }),
      ).toEqual(GENERIC);
    });

    it("does not offer details when there was no HTTP response", () => {
      expect(
        getChartError(undefined, {
          status: "FETCH_ERROR",
          error: "TypeError: Failed to fetch",
        }),
      ).toEqual(GENERIC);
    });

    it("prefers the failed request over stale results", () => {
      expect(
        getChartError(createMockDataset(), {
          status: 400,
          data: { error: RAW_ERROR },
        }),
      ).toEqual({ ...GENERIC, details: RAW_ERROR });
    });
  });

  describe("dataset with an error", () => {
    it("shows the generic message with the database error as details", () => {
      expect(
        getChartError(createMockDataset({ error: RAW_ERROR }), undefined),
      ).toEqual({ ...GENERIC, details: RAW_ERROR });
    });

    it("shows the permission message without details", () => {
      expect(
        getChartError(
          createMockDataset({
            error: "no access",
            error_type: "missing-required-permissions",
          }),
          undefined,
        ),
      ).toEqual(PERMISSION);
    });

    it("does not offer details for a non-string error", () => {
      expect(
        getChartError(
          createMockDataset({
            error: { status: 500, data: { message: RAW_ERROR } },
          }),
          undefined,
        ),
      ).toEqual(GENERIC);
    });
  });
});
