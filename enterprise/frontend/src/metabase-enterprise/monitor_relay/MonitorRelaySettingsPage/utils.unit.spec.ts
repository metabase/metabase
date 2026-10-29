import { getHistoryProgress } from "./utils";

describe("getHistoryProgress", () => {
  it("is null before the stream has a floor", () => {
    expect(getHistoryProgress({ w: null, floor: null, target: null })).toBe(
      null,
    );
  });

  it("is 0 when no row of the history has arrived", () => {
    expect(getHistoryProgress({ w: 100, floor: 101, target: 200 })).toBe(0);
  });

  it("counts the ids from the floor to the target", () => {
    expect(getHistoryProgress({ w: 150, floor: 101, target: 200 })).toBe(0.5);
  });

  it("is 1 when W reaches the target", () => {
    expect(getHistoryProgress({ w: 200, floor: 101, target: 200 })).toBe(1);
  });

  it("stays at 1 when W passes the target", () => {
    expect(getHistoryProgress({ w: 250, floor: 101, target: 200 })).toBe(1);
  });

  it("is 1 when the history has no rows", () => {
    expect(getHistoryProgress({ w: 200, floor: 201, target: 200 })).toBe(1);
  });

  it("is 0 when W is not known yet", () => {
    expect(getHistoryProgress({ w: null, floor: 101, target: 200 })).toBe(0);
  });
});
