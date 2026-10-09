import { buildSql } from "./build-sql";
import { defaultSpec } from "./defaults";

describe("buildSql", () => {
  it("wraps compiled base SQL as events_base and plans a funnel", () => {
    const built = buildSql(
      defaultSpec("funnel"),
      "SELECT person_id, created_at, ev_1, ev_2, ev_3 FROM events",
    );

    expect(built.sql).toContain("WITH events_base AS");
    expect(built.sql).toContain("windowFunnel");
    expect(built.sql).toContain("step_1");
    expect(built.sql).toContain("Viewed pricing");
    expect(built.ctes[0]?.name).toBe("events_base");
  });
});
