import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, within } from "__support__/ui";

import { createMockTableColumnOrderSetting } from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  createOrdersTableDatasetColumns,
} from "metabase-types/api/mocks/presets";

import type {
  FieldReference,
  TableColumnOrderSetting,
} from "metabase-types/api";

import {
  DEFAULT_QUERY,
  SAMPLE_DATABASE,
  SAMPLE_METADATA,
} from "metabase-lib/test-helpers";
import Question from "metabase-lib/Question";

import { ChartSettingAddRemoveColumns } from "./ChartSettingAddRemoveColumns";

const COLUMN_SETTINGS = [
  createMockTableColumnOrderSetting({
    name: "TOTAL",
    fieldRef: ["field", ORDERS.TOTAL, null],
    enabled: true,
  }),
  createMockTableColumnOrderSetting({
    name: "ID",
    fieldRef: ["field", ORDERS.ID, null],
    enabled: true,
  }),
  createMockTableColumnOrderSetting({
    name: "TAX",
    fieldRef: ["field", ORDERS.TAX, null],
    enabled: false,
  }),
  createMockTableColumnOrderSetting({
    name: "SUBTOTAL",
    fieldRef: ["field", ORDERS.SUBTOTAL, null],
    enabled: false,
  }),
];

const setup = ({
  value = COLUMN_SETTINGS,
  question = new Question(
    {
      dataset_query: DEFAULT_QUERY,
    },
    SAMPLE_METADATA,
  ),
} = {}) => {
  const onChange = jest.fn();

  renderWithProviders(
    <ChartSettingAddRemoveColumns
      value={value}
      query={question.query()}
      onChange={onChange}
    />,
  );

  return {
    onChange,
  };
};

describe("AddRemoveColumns", () => {
  it("should render and display columns present in column settings", () => {
    setup();
    expect(screen.getByLabelText("Total")).toBeChecked();
    expect(screen.getByLabelText("Tax")).toBeChecked();
    expect(screen.getByLabelText("Discount")).not.toBeChecked();
  });

  it("should allow you to remove columns", () => {
    const { onChange } = setup();
    userEvent.click(screen.getByLabelText("Total"));

    const [_, ...columnsWithoutTotal] = COLUMN_SETTINGS;

    expect(onChange).toHaveBeenCalledWith(
      columnsWithoutTotal,
      expect.anything(),
    );
  });

  it("should show fk tables and allow you to add columns", () => {
    const { onChange } = setup();
    expect(screen.getByText("User")).toBeInTheDocument();
    expect(screen.getByText("Product")).toBeInTheDocument();

    userEvent.click(screen.getByLabelText("Category"));

    expect(onChange).toHaveBeenCalledWith(
      [
        ...COLUMN_SETTINGS,
        createMockTableColumnOrderSetting({
          name: "CATEGORY",
          fieldRef: [
            "field",
            PRODUCTS.CATEGORY,
            { "source-field": ORDERS.PRODUCT_ID, "base-type": "type/Text" },
          ],
          enabled: true,
        }),
      ],
      expect.anything(),
    );
  });

  it("should allow you to search for columns", () => {
    const { onChange } = setup();

    userEvent.type(screen.getByPlaceholderText("Search for a column..."), "Pr");

    expect(screen.getByLabelText("Product ID")).toBeInTheDocument();
    expect(screen.getByLabelText("Price")).toBeInTheDocument();
    expect(screen.queryByText("User")).not.toBeInTheDocument();

    userEvent.click(screen.getByLabelText("Price"));

    expect(onChange).toHaveBeenCalledWith(
      [
        ...COLUMN_SETTINGS,
        createMockTableColumnOrderSetting({
          name: "PRICE",
          fieldRef: [
            "field",
            PRODUCTS.PRICE,
            { "source-field": ORDERS.PRODUCT_ID, "base-type": "type/Float" },
          ],
          enabled: true,
        }),
      ],
      expect.anything(),
    );
  });

  it("should disable aggregate fields", () => {
    setup({
      question: new Question(
        {
          dataset_query: {
            database: SAMPLE_DATABASE.id,
            type: "query",
            query: {
              aggregation: [
                ["count"],
                ["sum", ["field", ORDERS.TOTAL, { "base-type": "type/Float" }]],
              ],
              breakout: [
                ["field", ORDERS.PRODUCT_ID, { "base-type": "type/Integer" }],
              ],
              "source-table": ORDERS_ID,
            },
          },
        },
        SAMPLE_METADATA,
      ),
    });

    expect(screen.getByLabelText("Count")).toBeDisabled();
    expect(screen.getByLabelText("Sum of Total")).toBeDisabled();
    expect(screen.getByLabelText("Product ID")).toBeDisabled();
  });

  describe("bulk add / remove", () => {
    const ordersTableColumnSettings = createOrdersTableDatasetColumns().reduce(
      (memo: TableColumnOrderSetting[], column) => {
        memo.push(
          createMockTableColumnOrderSetting({
            name: column.name,
            fieldRef: column.field_ref as FieldReference,
            enabled: true,
          }),
        );
        return memo;
      },
      [],
    );

    it("should allow you to add all columns in a table with a single click", () => {
      const ordersWithoutQuantity = ordersTableColumnSettings?.slice(0, -1);

      const { onChange } = setup({ value: ordersWithoutQuantity });

      expect(screen.getByLabelText("Quantity")).not.toBeChecked();
      expect(screen.getAllByLabelText("Add all")[0]).not.toBeChecked();

      userEvent.click(
        within(
          screen.getByRole("list", { name: "orders-table-columns" }),
        ).getByLabelText("Add all"),
      );

      expect(onChange).toHaveBeenCalledWith(
        ordersTableColumnSettings,
        expect.anything(),
      );
    });

    it("should allow you to remove all columns from a table with a single click", () => {
      const { onChange } = setup({ value: ordersTableColumnSettings });

      expect(screen.getByLabelText("Remove all")).toBeChecked();

      userEvent.click(screen.getByLabelText("Remove all"));

      expect(onChange).toHaveBeenCalledWith([], expect.anything());
    });
  });
});
