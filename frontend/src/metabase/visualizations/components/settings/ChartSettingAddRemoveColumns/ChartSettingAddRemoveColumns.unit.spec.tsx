import { renderWithProviders, screen } from "__support__/ui";
import { DEFAULT_QUERY, SAMPLE_METADATA } from "metabase-lib/test-helpers";
import Question from "metabase-lib/Question";
import { createMockTableColumnOrderSetting } from "metabase-types/api/mocks";
import {
  ORDERS,
  PRODUCTS,
  ORDERS_ID,
  SAMPLE_DB_ID,
  createOrdersTableDatasetColumns,
  createOrdersTable,
} from "metabase-types/api/mocks/presets";
import { ChartSettingAddRemoveColumns } from "./ChartSettingAddRemoveColumns";
import userEvent from "@testing-library/user-event";
import type {
  FieldReference,
  TableColumnOrderSetting,
} from "metabase-types/api";

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

const setup = ({ value = COLUMN_SETTINGS } = {}) => {
  const onChange = jest.fn();
  const onWidgetOverride = jest.fn();

  const question = new Question(
    {
      dataset_query: DEFAULT_QUERY,
    },
    SAMPLE_METADATA,
  );

  renderWithProviders(
    <ChartSettingAddRemoveColumns
      value={value}
      question={question}
      onChange={onChange}
      onWidgetOverride={onWidgetOverride}
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

  describe("bulk add / remove", () => {
    const ordersTableColumnSettings = createOrdersTableDatasetColumns().reduce(
      (memo: TableColumnOrderSetting[], column) => {
        console.log(column);
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

      userEvent.click(screen.getAllByLabelText("Add all")[0]);

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
