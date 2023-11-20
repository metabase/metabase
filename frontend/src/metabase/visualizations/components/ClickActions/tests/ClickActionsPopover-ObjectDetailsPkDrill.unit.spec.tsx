import userEvent from "@testing-library/user-event";
import { screen } from "__support__/ui";
import {
  ORDERS,
  ORDERS_ID,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";
import type { Card } from "metabase-types/api";
import {
  ORDERS_COLUMNS_WITH_MULTIPLE_PK,
  ORDERS_QUESTION_WITH_MULTIPLE_PK,
  ORDERS_ROW_VALUES,
  ORDERS_ROW_VALUES_WITH_MULTIPLE_PK,
} from "metabase-lib/tests/drills-common";
import { setup } from "./common";

describe("ClickActionsPopover - ObjectDetailsPkDrill", () => {
  it.each<{
    columnName: keyof typeof ORDERS_COLUMNS_WITH_MULTIPLE_PK;
    expectedCard: Partial<Card>;
  }>([
    {
      columnName: "USER_ID",
      expectedCard: {
        dataset_query: {
          database: SAMPLE_DB_ID,
          query: {
            filter: [
              "=",
              [
                "field",
                ORDERS.USER_ID,
                {
                  "base-type": "type/Integer",
                },
              ],
              ORDERS_ROW_VALUES.USER_ID,
            ],
            "source-table": ORDERS_ID,
          },
          type: "query",
        },
        display: "table",
      },
    },
    {
      columnName: "PRODUCT_ID",
      expectedCard: {
        dataset_query: {
          database: SAMPLE_DB_ID,
          query: {
            filter: [
              "=",
              [
                "field",
                ORDERS.PRODUCT_ID,
                {
                  "base-type": "type/Integer",
                },
              ],
              ORDERS_ROW_VALUES.PRODUCT_ID,
            ],
            "source-table": ORDERS_ID,
          },
          type: "query",
        },
        display: "table",
      },
    },
    {
      columnName: "CREATED_AT",
      expectedCard: {
        dataset_query: {
          database: SAMPLE_DB_ID,
          query: {
            filter: [
              "=",
              [
                "field",
                ORDERS.USER_ID,
                {
                  "base-type": "type/Integer",
                },
              ],
              ORDERS_ROW_VALUES.USER_ID,
            ],
            "source-table": ORDERS_ID,
          },
          type: "query",
        },
        display: "table",
      },
    },
  ])(
    "should apply drill on $columnName cell click",
    async ({ columnName, expectedCard }) => {
      const { props } = await setup({
        question: ORDERS_QUESTION_WITH_MULTIPLE_PK,
        clicked: {
          column: ORDERS_COLUMNS_WITH_MULTIPLE_PK[columnName],
          value: ORDERS_ROW_VALUES_WITH_MULTIPLE_PK[columnName],
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
