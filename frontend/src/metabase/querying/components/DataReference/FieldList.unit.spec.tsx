import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import { PRODUCTS_ID } from "metabase-types/api/mocks/presets";

import { FieldList } from "./FieldList";

const STAGE_INDEX = -1;

const setup = () => {
  const table = checkNotNull(
    Lib.tableOrCardMetadata(SAMPLE_PROVIDER, PRODUCTS_ID),
  );
  const query = Lib.queryFromTableOrCardMetadata(SAMPLE_PROVIDER, table);
  const columns = Lib.returnedColumns(query, STAGE_INDEX);
  const onColumnClick = jest.fn<
    void,
    [Lib.Query, number, Lib.ColumnMetadata]
  >();

  renderWithProviders(
    <FieldList
      query={query}
      stageIndex={STAGE_INDEX}
      columns={columns}
      onColumnClick={onColumnClick}
    />,
  );

  return { query, onColumnClick };
};

describe("FieldList", () => {
  it("should render info icon", () => {
    setup();
    expect(screen.getAllByLabelText("More info")).toHaveLength(8);
  });

  it("should pass clicked column", async () => {
    const { query, onColumnClick } = setup();
    await userEvent.click(screen.getByText("ID"));
    expect(onColumnClick).toHaveBeenCalledTimes(1);
    const [clickedQuery, stageIndex, column] = onColumnClick.mock.calls[0];
    expect(clickedQuery).toBe(query);
    expect(stageIndex).toBe(STAGE_INDEX);
    expect(Lib.displayInfo(query, stageIndex, column).name).toBe("ID");
  });
});
