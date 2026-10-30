import { flagSql } from "./flag";

describe("flagSql", () => {
  it("accepts a column name", () => {
    expect(flagSql("ev_1")).toBe("ev_1");
  });

  it("rejects SQL injection", () => {
    expect(() => flagSql("ev_1; DROP TABLE pa_events")).toThrow(
      /Invalid flag column/,
    );
  });
});
