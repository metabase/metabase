import { fireEvent, render, screen } from "__support__/ui";
import * as Lib from "metabase-lib";
import { createQuery, columnFinder } from "metabase-lib/test-helpers";

import { QueryColumnInfoIcon, TableColumnInfoIcon } from "./ColumnInfoIcon";
import { IconContainer } from "metabase/components/MetadataInfo/InfoIcon/InfoIcon.styled";

function setup(table: string, column: string) {
  const query = createQuery();
  const columns = Lib.visibleColumns(query, 0);
  const findColumn = columnFinder(query, columns);
  const col = findColumn(table, column);

  return render(
    <IconContainer>
      <QueryColumnInfoIcon query={query} stageIndex={-1} column={col} />
    </IconContainer>,
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

  it("should render with IconContainer", () => {
    setup("PRODUCTS", "CATEGORY");
    const iconContainer = screen.getByLabelText("More info");
    expect(iconContainer).toHaveAttribute("class", expect.stringContaining("IconContainer"));
  });
});

describe("TableColumnInfoIcon", () => {
  it("should render with IconContainer", () => {
    render(<TableColumnInfoIcon field={{} as any} icon="string" />);
    const iconContainer = screen.getByLabelText("More info");
    expect(iconContainer).toHaveAttribute("class", expect.stringContaining("IconContainer"));
  });
});
