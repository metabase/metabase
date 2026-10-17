import { type TabSortConfig, getTabChange } from "./tab-change";

type Tab = "active" | "archived";
type Column = "created_at" | "name" | "archived_at";

const CONFIG: TabSortConfig<Tab, Column> = {
  tabSortColumns: {
    active: ["created_at", "name"],
    archived: ["created_at", "archived_at"],
  },
  defaultSortColumn: "created_at",
  defaultSortDirection: "desc",
};

describe("getTabChange", () => {
  it("goes back to the first page, keeping a sort the new tab shows", () => {
    expect(
      getTabChange(
        { page: 3, sort_column: "created_at", sort_direction: "asc" },
        "archived",
        CONFIG,
      ),
    ).toEqual({ tab: "archived", page: 0 });
  });

  it("resets a sort by a column the new tab doesn't show", () => {
    expect(
      getTabChange(
        { page: 0, sort_column: "name", sort_direction: "asc" },
        "archived",
        CONFIG,
      ),
    ).toEqual({
      tab: "archived",
      page: 0,
      sort_column: "created_at",
      sort_direction: "desc",
    });
  });
});
