import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  ORDERS,
  PRODUCTS,
  SAMPLE_DATABASE,
  metadata,
} from "__support__/sample_database_fixture";
import ChartSettingColumnEditor from "metabase/visualizations/components/settings/ChartSettingColumnEditor";

import Question from "metabase-lib/Question";

function renderChartSettingOrderedColumns(props) {
  render(<ChartSettingColumnEditor onChange={() => {}} {...props} />);
}

const toNativeColumn = column => ({
  base_type: column.base_type,
  display_name: column.display_name,
  effective_type: column.semantic_type,
  field_ref: ["field", column.name, { "base-type": column.base_type }],
  name: column.name,
  source: "native",
});

const STRUCTURED_QUERY_PROPS = {
  question: ORDERS.question(),
  columns: ORDERS.dimensions().map(dimension => dimension.column()),
};

const fieldRefFromColumn = (column, native = false) => [
  "field",
  native ? column.name : column.id,
  native ? { "base-type": column.base_type } : null,
];

const SubtotalFieldRef = (native = false) => [
  "field",
  native ? "SUBTOTAL" : 4,
  native ? { "base-type": "type/Float" } : null,
];

const ProductIdFieldRef = (native = false) => [
  "field",
  native ? "PRODUCT_ID" : 3,
  native ? { "base-type": "type/Integer" } : null,
];

const TaxFieldRef = (native = false) => [
  "field",
  native ? "TAX" : 5,
  native ? { "base-type": "type/Float" } : null,
];

const NATIVE_QUERY_PROPS = {
  columns: ORDERS.dimensions()
    .map(dimension => dimension.column())
    .map(toNativeColumn),
  question: new Question(
    {
      dataset_query: {
        type: "native",
        native: {
          query: "SELECT * FROM ORDERS",
        },
        database: SAMPLE_DATABASE.id,
      },
    },
    metadata,
  ),
};

const TEST_CASES = [
  {
    name: "Structured Query",
    props: STRUCTURED_QUERY_PROPS,
  },
  {
    name: "Structured Query in dashboard",
    props: {
      ...STRUCTURED_QUERY_PROPS,
      isDashboard: true,
      metadata,
    },
  },
  {
    name: "Native Query",
    props: NATIVE_QUERY_PROPS,
    native: true,
  },
];

describe("ChartSettingOrderedColumns", () => {
  TEST_CASES.map(({ name, props, native = false }) => {
    describe(name, () => {
      it("Should render values correctly", () => {
        renderChartSettingOrderedColumns({
          value: [
            { fieldRef: SubtotalFieldRef(native), enabled: true },
            { fieldRef: ProductIdFieldRef(native), enabled: false },
          ],
          ...props,
        });
        expect(
          screen.getByRole("checkbox", { name: /Subtotal/i }),
        ).toBeChecked();
        expect(
          screen.getByRole("checkbox", { name: /product[_ ]id/i }),
        ).not.toBeChecked();
      });

      it("should add a column", () => {
        const onChange = jest.fn();
        renderChartSettingOrderedColumns({
          value: [
            { fieldRef: SubtotalFieldRef(native), enabled: true },
            { fieldRef: ProductIdFieldRef(native), enabled: false },
          ],
          onChange,
          ...props,
        });
        const ADD = screen.getByRole("checkbox", { name: /product[_ ]id/i });

        fireEvent.click(ADD);
        expect(onChange.mock.calls).toEqual([
          [
            [
              { fieldRef: SubtotalFieldRef(native), enabled: true },
              { fieldRef: ProductIdFieldRef(native), enabled: true },
            ],
          ],
        ]);
      });

      it("should remove a column", () => {
        const onChange = jest.fn();
        renderChartSettingOrderedColumns({
          value: [
            { fieldRef: SubtotalFieldRef(native), enabled: true },
            { fieldRef: ProductIdFieldRef(native), enabled: false },
          ],
          onChange,
          ...props,
        });
        fireEvent.click(screen.getByRole("checkbox", { name: /Subtotal/i }));
        expect(onChange.mock.calls).toEqual([
          [
            [
              { fieldRef: SubtotalFieldRef(native), enabled: false },
              { fieldRef: ProductIdFieldRef(native), enabled: false },
            ],
          ],
        ]);
      });

      it("should properly show bulk actions - Deselect All", () => {
        renderChartSettingOrderedColumns({
          value: [
            { fieldRef: SubtotalFieldRef(native), enabled: true },
            { fieldRef: ProductIdFieldRef(native), enabled: false },
          ],
          ...props,
        });

        expect(
          screen.getByTestId(
            native ? "bulk-action-Columns" : "bulk-action-Orders",
          ),
        ).toHaveTextContent("Deselect All");
      });

      it("should properly show bulk actions - Select All", () => {
        renderChartSettingOrderedColumns({
          value: [
            { fieldRef: SubtotalFieldRef(native), enabled: false },
            { fieldRef: ProductIdFieldRef(native), enabled: false },
          ],
          ...props,
        });

        expect(
          screen.getByTestId(
            native ? "bulk-action-Columns" : "bulk-action-Orders",
          ),
        ).toHaveTextContent("Select All");
      });

      it("should bulk enable", () => {
        const onChange = jest.fn();
        renderChartSettingOrderedColumns({
          value: [
            { fieldRef: SubtotalFieldRef(native), enabled: false },
            { fieldRef: ProductIdFieldRef(native), enabled: false },
          ],
          onChange,
          ...props,
        });

        //Because the order of the columns is preserved and all new fields are appended, we need to exclude these
        const EXPECTED = ORDERS.dimensions()
          .filter(
            dimension =>
              dimension.fieldIdOrName() !== 4 &&
              dimension.fieldIdOrName() !== 3 &&
              dimension.fieldIdOrName() !== "SUBTOTAL" &&
              dimension.fieldIdOrName() !== "PRODUCT_ID",
          )
          .map(dimension => ({
            enabled: true,
            fieldRef: fieldRefFromColumn(dimension.column(), native),
          }));

        const bulkActionButton = screen.getByTestId(
          native ? "bulk-action-Columns" : "bulk-action-Orders",
        );

        expect(bulkActionButton).toHaveTextContent("Select All");

        fireEvent.click(bulkActionButton);

        expect(onChange).toHaveBeenCalledWith([
          { fieldRef: SubtotalFieldRef(native), enabled: true },
          { fieldRef: ProductIdFieldRef(native), enabled: true },
          ...EXPECTED,
        ]);
      });

      it("should bulk disable", () => {
        const onChange = jest.fn();
        renderChartSettingOrderedColumns({
          value: [
            { fieldRef: SubtotalFieldRef(native), enabled: true },
            { fieldRef: ProductIdFieldRef(native), enabled: true },
            { fieldRef: TaxFieldRef(native), enabled: true },
          ],
          ...props,
          onChange,
        });

        const bulkActionButton = screen.getByTestId(
          native ? "bulk-action-Columns" : "bulk-action-Orders",
        );

        expect(bulkActionButton).toHaveTextContent("Deselect All");

        fireEvent.click(bulkActionButton);

        expect(onChange).toHaveBeenCalledWith([
          { fieldRef: SubtotalFieldRef(native), enabled: false },
          { fieldRef: ProductIdFieldRef(native), enabled: false },
          { fieldRef: TaxFieldRef(native), enabled: false },
        ]);
      });
    });
  });

  describe("Structured Query - foreign keys", () => {
    it("should list and add additional columns", () => {
      const onChange = jest.fn();
      renderChartSettingOrderedColumns({
        value: [],
        onChange,
        ...STRUCTURED_QUERY_PROPS,
      });

      expect(screen.getByText(/orders/i)).toBeInTheDocument();
      expect(screen.getByText(/products/i)).toBeInTheDocument();
      expect(screen.getByText(/people/i)).toBeInTheDocument();
      expect(screen.getAllByRole("checkbox")).toHaveLength(28);

      fireEvent.click(screen.getByRole("checkbox", { name: /password/i }));

      expect(onChange.mock.calls).toEqual([
        [[{ fieldRef: ["field", 17, { "source-field": 7 }], enabled: true }]],
      ]);
    });

    it("should bulk enable", () => {
      const onChange = jest.fn();
      renderChartSettingOrderedColumns({
        value: [
          { fieldRef: ["field", 4, null], enabled: true },
          { fieldRef: ["field", 3, null], enabled: false },
        ],
        onChange,
        ...STRUCTURED_QUERY_PROPS,
      });

      const EXPECTED = PRODUCTS.dimensions().map(dimension => ({
        enabled: true,
        fieldRef: ["field", dimension.fieldIdOrName(), { "source-field": 3 }],
      }));

      expect(screen.getByTestId("bulk-action-Products")).toHaveTextContent(
        "Select All",
      );
      expect(screen.getByTestId("bulk-action-Orders")).toHaveTextContent(
        "Deselect All",
      );

      fireEvent.click(screen.getByTestId("bulk-action-Products"));

      expect(onChange).toHaveBeenCalledWith([
        { fieldRef: ["field", 4, null], enabled: true },
        { fieldRef: ["field", 3, null], enabled: false },
        ...EXPECTED,
      ]);
    });
  });

  describe("Native Query - table name", () => {
    it("should substitute `Columns` for table name", () => {
      renderChartSettingOrderedColumns({
        value: [
          {
            fieldRef: ["field", "SUBTOTAL", { "base-type": "type/Float" }],
            enabled: true,
          },
          {
            fieldRef: ["field", "PRODUCT_ID", { "base-type": "type/Integer" }],
            enabled: false,
          },
        ],
        ...NATIVE_QUERY_PROPS,
      });

      expect(screen.getByText("Columns")).toBeInTheDocument();
      expect(screen.getByTestId("bulk-action-Columns")).toHaveTextContent(
        "Deselect All",
      );
    });
  });
});
