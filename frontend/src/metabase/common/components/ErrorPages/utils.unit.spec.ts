import fetchMock from "fetch-mock";

import { createMockDashboard } from "metabase-types/api/mocks";

import { getEntityDetails } from "./utils";

describe("getEntityDetails", () => {
  it("should fetch the dashboard definition for a dashboard", async () => {
    const dashboard = createMockDashboard({ id: 1, name: "My dashboard" });
    fetchMock.get("path:/api/dashboard/1", dashboard);

    const result = await getEntityDetails({
      entity: "dashboard",
      id: "1",
      dispatch: jest.fn(),
    });

    expect(result).toEqual(dashboard);
  });
});
