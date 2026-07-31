import { isBrokerableApiPath } from "./protocol";

// Which `/api` routes answer a data app is the backend's decision — the `data-app`
// client marker confines every brokered request to the `data-apps:base` scope. All
// this guard does is keep the broker inside `/api`, where that scope applies.
describe("isBrokerableApiPath", () => {
  it("relays API paths", () => {
    expect(isBrokerableApiPath("/api")).toBe(true);
    expect(isBrokerableApiPath("/api/dataset")).toBe(true);
    expect(isBrokerableApiPath("/api/card/1/query")).toBe(true);
  });

  it("refuses paths no endpoint scope covers", () => {
    // Auth routes are the reason this guard exists: they reach the session with
    // no scope enforcement behind them.
    expect(isBrokerableApiPath("/auth/sso")).toBe(false);
    expect(isBrokerableApiPath("/app/dist/app-main.js")).toBe(false);
    expect(isBrokerableApiPath("/")).toBe(false);
  });

  it("refuses a path that merely starts with the same letters", () => {
    expect(isBrokerableApiPath("/apifoo")).toBe(false);
  });
});
