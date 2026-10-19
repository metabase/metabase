import { fetchDashboardFulfilled } from "./core";
import { fetchDashboard } from "./data-fetching";

describe("fetchDashboardFulfilled", () => {
  // It stands in for `fetchDashboard.fulfilled` so `reducers.ts` can match on it
  // without importing the thunk. Matching is by type string, so if the two ever
  // drift apart the reducer silently stops responding to a loaded dashboard.
  it("has the same action type as the thunk it stands for", () => {
    expect(fetchDashboardFulfilled.type).toBe(fetchDashboard.fulfilled.type);
  });
});
