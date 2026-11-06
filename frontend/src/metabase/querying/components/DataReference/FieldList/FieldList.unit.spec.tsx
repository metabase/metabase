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
  const onColumnClick = jest.fn<void, [number]>();

  renderWithProviders(
    <FieldList
      query={query}
      stageIndex={STAGE_INDEX}
      columns={columns}
      onColumnClick={onColumnClick}
    />,
  );

  return { query, columns, onColumnClick };
};

describe("FieldList", () => {
  it("should render info icon", () => {
    setup();
    expect(screen.getAllByLabelText("More info")).toHaveLength(8);
  });

  it("should pass clicked column index", async () => {
    const { query, columns, onColumnClick } = setup();
    await userEvent.click(screen.getByText("ID"));
    expect(onColumnClick).toHaveBeenCalledTimes(1);
    const [columnIndex] = onColumnClick.mock.calls[0];
    expect(Lib.displayInfo(query, STAGE_INDEX, columns[columnIndex]).name).toBe(
      "ID",
    );
  });
});
