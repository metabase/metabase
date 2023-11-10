import { createMockMetadata } from "__support__/metadata";
import {
  createSampleDatabase,
  ORDERS,
  ORDERS_ID,
} from "metabase-types/api/mocks/presets";
import { checkNotNull } from "metabase/lib/types";
import type { ClickObject } from "metabase/visualizations/types";
import type { DatasetColumn, RowValue } from "metabase-types/api";

import type Question from "metabase-lib/Question";
import { ObjectDetailDrill } from "./ObjectDetailDrill";

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});

const ordersTable = checkNotNull(metadata.table(ORDERS_ID));
const orderIDField = checkNotNull(metadata.field(ORDERS.ID));
const orderIDColumn = orderIDField.column();

const DEFAULT_CELL_VALUE = 1;

const DATA_VALUES = {
  [ORDERS.ID]: "5",
  [ORDERS.USER_ID]: "1",
  [ORDERS.PRODUCT_ID]: "132",
  [ORDERS.SUBTOTAL]: 127.88197029833711,
  [ORDERS.TAX]: 7.03,
  [ORDERS.TOTAL]: 134.9119702983371,
  [ORDERS.DISCOUNT]: null,
  [ORDERS.CREATED_AT]: "2018-10-10T03:34:47.309+03:00",
  [ORDERS.QUANTITY]: 5,
};

const DATA = ordersTable.fields?.map(field => ({
  col: field.column(),
  value: DATA_VALUES[field.column().id as number],
}));

function setup({
  question = ordersTable.question(),
  column = orderIDColumn,
  value = DEFAULT_CELL_VALUE,
  extraData = undefined,
  data = DATA,
}: {
  question?: Question;
  column?: DatasetColumn;
  value?: RowValue;
  extraData?: ClickObject["extraData"];
  data?: ClickObject["data"];
} = {}) {
  const actions = ObjectDetailDrill({
    question,
    clicked: { column, value, extraData, data },
  });
  return {
    actions,
    cellValue: value,
  };
}

describe("ObjectDetailDrill", () => {
  it("should not be valid for top level actions", () => {
    const actions = ObjectDetailDrill({ question: ordersTable.question() });
    expect(actions).toHaveLength(0);
  });

  it("should not be valid when clicked value is undefined", () => {
    const actions = ObjectDetailDrill({
      question: ordersTable.question(),
      clicked: {
        column: orderIDColumn,
        value: undefined,
      },
    });
    expect(actions).toHaveLength(0);
  });

  it("should not be available for not editable queries", () => {
    const question = ordersTable.question();
    question.query().isEditable = () => false;

    const pk = setup({
      question,
      column: orderIDColumn,
    });
    const fk = setup({
      question,
      column: metadata.field(ORDERS.PRODUCT_ID)?.column(),
    });

    expect(pk.actions).toHaveLength(0);
    expect(fk.actions).toHaveLength(0);
  });
});
