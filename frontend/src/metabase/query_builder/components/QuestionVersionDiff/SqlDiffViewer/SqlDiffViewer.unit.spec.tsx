import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";

import { type SqlDiffViewMode, SqlDiffViewer } from "./SqlDiffViewer";

const OLD_SQL = "SELECT *\nFROM PRODUCTS\nWHERE CATEGORY = 'Widget';";
const NEW_SQL =
  "SELECT *\nFROM PRODUCTS\nWHERE CATEGORY IN ('Widget', 'Gadget');";

function setup({
  oldSql = OLD_SQL,
  newSql = NEW_SQL,
  mode = "unified",
}: { oldSql?: string; newSql?: string; mode?: SqlDiffViewMode } = {}) {
  renderWithProviders(
    <SqlDiffViewer oldSql={oldSql} newSql={newSql} mode={mode} />,
  );
}

describe("SqlDiffViewer", () => {
  it("renders removed, added and unchanged lines in unified mode", () => {
    setup();

    expect(screen.getAllByTestId("sql-diff-line-context")).toHaveLength(2);
    expect(screen.getByTestId("sql-diff-line-removed")).toHaveTextContent(
      "WHERE CATEGORY = 'Widget';",
    );
    expect(screen.getByTestId("sql-diff-line-added")).toHaveTextContent(
      "WHERE CATEGORY IN ('Widget', 'Gadget');",
    );
  });

  it("renders both versions next to each other in split mode", () => {
    setup({ mode: "split" });

    const rows = screen.getAllByTestId("sql-diff-row");
    expect(rows).toHaveLength(3);
    expect(rows[2]).toHaveTextContent("WHERE CATEGORY = 'Widget';");
    expect(rows[2]).toHaveTextContent(
      "WHERE CATEGORY IN ('Widget', 'Gadget');",
    );
  });

  it("collapses long unchanged sections and expands them on click", async () => {
    const columns = Array.from({ length: 20 }, (_, i) => `  COLUMN_${i},`);
    const oldSql = ["SELECT", ...columns, "  ID", "FROM A"].join("\n");
    const newSql = ["SELECT", ...columns, "  ID", "FROM B"].join("\n");
    setup({ oldSql, newSql });

    expect(screen.queryByText("COLUMN_0,")).not.toBeInTheDocument();
    await userEvent.click(screen.getByText("Show 19 unchanged lines"));
    expect(screen.getByText("COLUMN_0,", { exact: false })).toBeInTheDocument();
    expect(screen.queryByText(/unchanged lines?$/)).not.toBeInTheDocument();
  });
});
