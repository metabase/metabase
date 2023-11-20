import userEvent from "@testing-library/user-event";
import { screen } from "__support__/ui";
import {
  PEOPLE,
  PEOPLE_ID,
  PRODUCTS,
  PRODUCTS_ID,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";
import {
  ORDERS_COLUMNS,
  ORDERS_ROW_VALUES,
} from "metabase-lib/tests/drills-common";
import { setup } from "./common";

describe("ClickActionsPopover - ObjectDetailsFkDrill", () => {
  it.each([
    {
      column: ORDERS_COLUMNS.USER_ID,
      columnName: ORDERS_COLUMNS.USER_ID.name,
      cellValue: ORDERS_ROW_VALUES.USER_ID,
      expectedCard: {
        dataset_query: {
          database: SAMPLE_DB_ID,
          query: {
            filter: [
              "=",
              [
                "field",
                PEOPLE.ID,
                {
                  "base-type": "type/BigInteger",
                },
              ],
              ORDERS_ROW_VALUES.USER_ID,
            ],
            "source-table": PEOPLE_ID,
          },
          type: "query",
        },
        display: "table",
      },
    },
    {
      column: ORDERS_COLUMNS.PRODUCT_ID,
      columnName: ORDERS_COLUMNS.PRODUCT_ID.name,
      cellValue: ORDERS_ROW_VALUES.PRODUCT_ID,
      expectedCard: {
        dataset_query: {
          database: SAMPLE_DB_ID,
          query: {
            filter: [
              "=",
              [
                "field",
                PRODUCTS.ID,
                {
                  "base-type": "type/BigInteger",
                },
              ],
              ORDERS_ROW_VALUES.PRODUCT_ID,
            ],
            "source-table": PRODUCTS_ID,
          },
          type: "query",
        },
        display: "table",
      },
    },
  ])(
    "should apply drill on $columnName cell click",
    async ({ column, cellValue, expectedCard }) => {
      const { props } = await setup({
        clicked: {
          column,
          value: cellValue,
        },
      });

      const drill = screen.getByText("View details");
      expect(drill).toBeInTheDocument();

      userEvent.click(drill);

      expect(props.onChangeCardAndRun).toHaveBeenCalledTimes(1);
      expect(props.onChangeCardAndRun).toHaveBeenLastCalledWith(
        expect.objectContaining({
          nextCard: expect.objectContaining(expectedCard),
        }),
      );
    },
  );
});
