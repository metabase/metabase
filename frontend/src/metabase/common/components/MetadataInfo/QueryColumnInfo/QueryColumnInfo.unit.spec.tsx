import { renderWithProviders, screen } from "__support__/ui";
import * as Lib from "metabase-lib";
import {
  DEFAULT_TEST_QUERY,
  SAMPLE_PROVIDER,
  columnFinder,
} from "metabase-lib/test-helpers";

import { QueryColumnInfo } from "./QueryColumnInfo";

const STAGE_INDEX = -1;

interface SetupOpts {
  tableName: string;
  columnName: string;
}

const setup = ({ tableName, columnName }: SetupOpts) => {
  const query = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);
  const findColumn = columnFinder(query, Lib.visibleColumns(query, 0));

  renderWithProviders(
    <QueryColumnInfo
      query={query}
      stageIndex={STAGE_INDEX}
      column={findColumn(tableName, columnName)}
    />,
  );
};

describe("QueryColumnInfo", () => {
  it("should show the given dimension's semantic type name", () => {
    setup({ tableName: "PRODUCTS", columnName: "CATEGORY" });

    expect(screen.getByText("Category")).toBeInTheDocument();
  });

  it("should display the given dimension's description", () => {
    setup({ tableName: "PRODUCTS", columnName: "CATEGORY" });

    expect(screen.getByText("The type of product.")).toBeInTheDocument();
  });

  it("should show a placeholder for a dimension with no description", () => {
    setup({ tableName: "PRODUCTS", columnName: "CREATED_AT" });

    expect(screen.getByText("No description")).toBeInTheDocument();
  });
});
