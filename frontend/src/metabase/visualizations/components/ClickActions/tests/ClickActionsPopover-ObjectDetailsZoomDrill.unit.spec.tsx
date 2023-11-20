import userEvent from "@testing-library/user-event";
import { ZOOM_IN_ROW } from "metabase/query_builder/actions";
import { screen } from "__support__/ui";
import {
  ORDERS_COLUMNS,
  ORDERS_COLUMNS_LIST,
  ORDERS_ROW_VALUES,
} from "metabase-lib/tests/drills-common";
import { setup } from "./common";

describe("ClickActionsPopover - ObjectDetailsZoomDrill", () => {
  it.each([
    {
      column: ORDERS_COLUMNS.ID,
      columnName: ORDERS_COLUMNS.ID.name,
      cellValue: ORDERS_ROW_VALUES.ID,
      expectedAction: {
        type: ZOOM_IN_ROW,
        payload: { objectId: ORDERS_ROW_VALUES.ID },
      },
    },
    {
      column: ORDERS_COLUMNS.TOTAL,
      columnName: ORDERS_COLUMNS.TOTAL.name,
      cellValue: ORDERS_ROW_VALUES.TOTAL,
      expectedAction: {
        type: ZOOM_IN_ROW,
        payload: { objectId: ORDERS_ROW_VALUES.ID },
      },
    },
  ])(
    "should apply drill on $columnName cell click",
    async ({ column, cellValue, expectedAction }) => {
      const { props } = await setup({
        clicked: {
          column,
          value: cellValue,
          data: ORDERS_COLUMNS_LIST.map(column => ({
            col: ORDERS_COLUMNS[column.name as keyof typeof ORDERS_ROW_VALUES],
            value:
              ORDERS_ROW_VALUES[column.name as keyof typeof ORDERS_ROW_VALUES],
          })),
        },
      });

      const drill = screen.getByText("View details");
      expect(drill).toBeInTheDocument();

      userEvent.click(drill);

      expect(props.dispatch).toHaveBeenCalledWith(expectedAction);
    },
  );
});
