import { fetchDataOrError } from "metabase/dashboard/dashboard";

describe("Dashboard", () => {
  describe("fetchDataOrError()", () => {
    it("should return data on successful fetch", async () => {
      const data = {
        series: [1, 2, 3],
      };

      const successfulFetch = Promise.resolve(data);

      const result = await fetchDataOrError(successfulFetch);
      expect(result.error).toBeUndefined();
      expect(result).toEqual(data);
    });

    it("should return map with error key on failed fetch", async () => {
      const error = {
        status: 504,
        statusText: "GATEWAY_TIMEOUT",
        data: {
          message:
            "Failed to load resource: the server responded with a status of 504 (GATEWAY_TIMEOUT)",
        },
      };

      const failedFetch = Promise.reject(error);

      const result = await fetchDataOrError(failedFetch);
      expect(result.error).toEqual(error);
    });
  });
});
