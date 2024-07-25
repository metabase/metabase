import { fireEvent, render, screen } from "__support__/ui";
import * as Lib from "metabase-lib";
import { createQuery, columnFinder } from "metabase-lib/test-helpers";

import { QueryColumnInfoIcon, TableColumnInfoIcon } from "./ColumnInfoIcon";

function setup(table: string, column: string) {
  const query = createQuery();
  const columns = Lib.visibleColumns(query, 0);
  const findColumn = columnFinder(query, columns);
  const col = findColumn(table, column);

  return render(
    <QueryColumnInfoIcon query={query} stageIndex={-1} column={col} />,
  );
}

describe("QueryColumnInfoIcon", () => {
  it("should show the hovercard only on hover", async () => {
    setup("PRODUCTS", "CATEGORY");

    const icon = screen.getByLabelText("More info");

    expect(icon).toBeInTheDocument();
    expect(screen.queryByText("Category")).not.toBeInTheDocument();

    fireEvent.mouseEnter(icon);

    expect(await screen.findByText("Category")).toBeInTheDocument();
  });

  it("should render with default size of 14px", () => {
    setup("PRODUCTS", "CATEGORY");
    const iconContainer = screen.getByLabelText("More info");
    expect(iconContainer).toHaveStyle("font-size: 14px");
  });

  it("should render with custom size", () => {
    const query = createQuery();
    const columns = Lib.visibleColumns(query, 0);
    const findColumn = columnFinder(query, columns);
    const col = findColumn("PRODUCTS", "CATEGORY");

    render(
      <QueryColumnInfoIcon
        query={query}
        stageIndex={0}
        column={col}
        size={18}
      />,
    );

    const iconContainer = screen.getByLabelText("More info");
    expect(iconContainer).toHaveStyle("font-size: 18px");
  });
});

describe("TableColumnInfoIcon", () => {
  it("should render with default size of 14px", () => {
    render(<TableColumnInfoIcon field={{} as any} icon="string" />);

    const iconContainer = screen.getByLabelText("More info");
    expect(iconContainer).toHaveStyle("font-size: 14px");
  });

  it("should render with custom size", () => {
    render(<TableColumnInfoIcon field={{} as any} icon="string" size={18} />);

    const iconContainer = screen.getByLabelText("More info");
    expect(iconContainer).toHaveStyle("font-size: 18px");
  });
});
