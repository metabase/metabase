import { fireEvent, render, screen, waitFor } from "__support__/ui";
import * as Lib from "metabase-lib";
import {
  DEFAULT_TEST_QUERY,
  SAMPLE_PROVIDER,
  columnFinder,
} from "metabase-lib/test-helpers";

import { QueryColumnInfoIcon } from "./QueryColumnInfoIcon";

const STAGE_INDEX = -1;

interface SetupOpts {
  tableName: string;
  columnName: string;
}

const setup = ({ tableName, columnName }: SetupOpts) => {
  const query = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);
  const findColumn = columnFinder(query, Lib.visibleColumns(query, 0));

  render(
    <QueryColumnInfoIcon
      query={query}
      stageIndex={STAGE_INDEX}
      column={findColumn(tableName, columnName)}
    />,
  );
};

describe("QueryColumnInfoIcon", () => {
  it("should show the hovercard only on hover", async () => {
    setup({ tableName: "PRODUCTS", columnName: "CATEGORY" });

    const icon = screen.getByLabelText("More info");

    expect(icon).toBeInTheDocument();
    expect(screen.queryByText("Category")).not.toBeInTheDocument();

    fireEvent.mouseEnter(icon);

    await waitFor(
      () => {
        expect(screen.getByText("Category")).toBeInTheDocument();
      },
      {
        timeout: 1200,
      },
    );
  });
});
