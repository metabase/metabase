import { createMockState } from "metabase-types/store/mocks";
import { fetchDashboardCardMetadata } from "./data-fetching";

describe("fetchDashboardCardMetadata", function () {
  it("should not generate runtime error in case of empty dashboard", async () => {
    const dispatch = jest.fn();
    const getState = createMockState;

    await expect(
      fetchDashboardCardMetadata()(dispatch, getState),
    ).resolves.not.toThrow();
  });
});
