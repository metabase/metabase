import { adminToolsTasksRunsFor } from "./admin";

describe("adminToolsTasksRunsFor", () => {
  it("builds a runs URL scoped by run type and entity", () => {
    const url = adminToolsTasksRunsFor({
      runType: "alert",
      entityType: "card",
      entityId: 42,
    });
    const { pathname, search } = parseUrl(url);
    expect(pathname).toBe("/admin/tools/tasks/runs");
    expect(search.get("run-type")).toBe("alert");
    expect(search.get("entity-type")).toBe("card");
    expect(search.get("entity-id")).toBe("42");
    expect(search.get("started-at")).toBeNull();
  });

  it("includes started-at when provided, so the entity picker can populate", () => {
    const url = adminToolsTasksRunsFor({
      runType: "alert",
      entityType: "card",
      entityId: 42,
      startedAt: "past30days~",
    });
    expect(parseUrl(url).search.get("started-at")).toBe("past30days~");
  });
});

function parseUrl(url: string) {
  const parsed = new URL(url, "http://localhost");
  return { pathname: parsed.pathname, search: parsed.searchParams };
}
