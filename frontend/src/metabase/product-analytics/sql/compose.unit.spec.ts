import { CycleError, type QueryPlan, compose } from "./compose";

describe("compose", () => {
  it("orders CTEs by dependencies and renders WITH", () => {
    const plan: QueryPlan = {
      ctes: [
        {
          name: "scoped_events",
          body: "SELECT 1",
          deps: ["events_base"],
        },
        {
          name: "events_base",
          body: "SELECT 2",
          deps: [],
        },
      ],
      select: "SELECT * FROM scoped_events",
      warnings: [],
    };

    const sql = compose(plan);
    expect(sql.indexOf("events_base")).toBeLessThan(
      sql.indexOf("scoped_events"),
    );
    expect(sql).toContain("WITH events_base AS");
    expect(sql).toContain("scoped_events AS");
    expect(sql.trim().endsWith("SELECT * FROM scoped_events")).toBe(true);
  });

  it("throws on a cycle", () => {
    const plan: QueryPlan = {
      ctes: [
        { name: "a", body: "SELECT 1", deps: ["b"] },
        { name: "b", body: "SELECT 2", deps: ["a"] },
      ],
      select: "SELECT 1",
      warnings: [],
    };
    expect(() => compose(plan)).toThrow(CycleError);
  });
});
