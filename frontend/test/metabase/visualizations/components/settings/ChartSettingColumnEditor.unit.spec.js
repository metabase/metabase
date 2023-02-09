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

const STRUCTURED_QUERY_TEST_CASES = [
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
];

describe("ChartSettingOrderedColumns", () => {
  describe("structured queryies", () => {
    STRUCTURED_QUERY_TEST_CASES.map(({ name, props }) => {
      describe(name, () => {
        it("Should render values correctly", () => {
          renderChartSettingOrderedColumns({
            value: [
              { fieldRef: ["field", 4, null], enabled: true },
              { fieldRef: ["field", 3, null], enabled: false },
            ],
            ...props,
          });
          expect(
            screen.getByRole("checkbox", { name: /Subtotal/i }),
          ).toBeChecked();
          expect(
            screen.getByRole("checkbox", { name: /product id/i }),
          ).not.toBeChecked();
        });

        it("should add a column", () => {
          const onChange = jest.fn();
          renderChartSettingOrderedColumns({
            value: [
              { fieldRef: ["field", 4, null], enabled: true },
              { fieldRef: ["field", 3, null], enabled: false },
            ],
            onChange,
            ...props,
          });
          const ADD = screen.getByRole("checkbox", { name: /product id/i });

          fireEvent.click(ADD);
          expect(onChange.mock.calls).toEqual([
            [
              [
                { fieldRef: ["field", 4, null], enabled: true },
                { fieldRef: ["field", 3, null], enabled: true },
              ],
            ],
          ]);
        });

        it("should remove a column", () => {
          const onChange = jest.fn();
          renderChartSettingOrderedColumns({
            value: [
              { fieldRef: ["field", 4, null], enabled: true },
              { fieldRef: ["field", 3, null], enabled: false },
            ],
            onChange,
            ...props,
          });
          fireEvent.click(screen.getByRole("checkbox", { name: /Subtotal/i }));
          expect(onChange.mock.calls).toEqual([
            [
              [
                { fieldRef: ["field", 4, null], enabled: false },
                { fieldRef: ["field", 3, null], enabled: false },
              ],
            ],
          ]);
        });

        it("should properly show bulk actions - Deselect All", () => {
          renderChartSettingOrderedColumns({
            value: [
              { fieldRef: ["field", 4, null], enabled: true },
              { fieldRef: ["field", 3, null], enabled: false },
            ],
            ...props,
          });

          expect(screen.getByTestId("bulk-action-Orders")).toHaveTextContent(
            "Deselect All",
          );
        });

        it("should properly show bulk actions - Select All", () => {
          renderChartSettingOrderedColumns({
            value: [
              { fieldRef: ["field", 4, null], enabled: false },
              { fieldRef: ["field", 3, null], enabled: false },
            ],
            ...props,
          });

          expect(screen.getByTestId("bulk-action-Orders")).toHaveTextContent(
            "Select All",
          );
        });

        it("should bulk enable", () => {
          const onChange = jest.fn();
          renderChartSettingOrderedColumns({
            value: [
              { fieldRef: ["field", 4, null], enabled: false },
              { fieldRef: ["field", 3, null], enabled: false },
            ],
            onChange,
            ...props,
          });

          //Because the order of the columns is preserved and all new fields are appended, we need to exclude these
          const EXPECTED = ORDERS.dimensions()
            .filter(
              dimension =>
                dimension.fieldIdOrName() !== 4 &&
                dimension.fieldIdOrName() !== 3,
            )
            .map(dimension => ({
              enabled: true,
              fieldRef: dimension.mbql(),
            }));

          const bulkActionButton = screen.getByTestId("bulk-action-Orders");

          expect(bulkActionButton).toHaveTextContent("Select All");

          fireEvent.click(bulkActionButton);

          expect(onChange).toHaveBeenCalledWith([
            { fieldRef: ["field", 4, null], enabled: true },
            { fieldRef: ["field", 3, null], enabled: true },
            ...EXPECTED,
          ]);
        });

        it("should bulk disable", () => {
          const onChange = jest.fn();
          renderChartSettingOrderedColumns({
            value: [
              { fieldRef: ["field", 4, null], enabled: true },
              { fieldRef: ["field", 3, null], enabled: true },
              { fieldRef: ["field", 5, null], enabled: true },
            ],
            ...props,
            onChange,
          });

          const bulkActionButton = screen.getByTestId("bulk-action-Orders");

          expect(bulkActionButton).toHaveTextContent("Deselect All");

          fireEvent.click(bulkActionButton);

          expect(onChange).toHaveBeenCalledWith([
            { fieldRef: ["field", 4, null], enabled: false },
            { fieldRef: ["field", 3, null], enabled: false },
            { fieldRef: ["field", 5, null], enabled: false },
          ]);
        });
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

    it("should not list additional columns when in a dashboard", () => {
      const onChange = jest.fn();
      renderChartSettingOrderedColumns({
        value: [],
        onChange,
        ...STRUCTURED_QUERY_PROPS,
        isDashboard: true,
        metadata: metadata,
      });

      expect(screen.getByText(/orders/i)).toBeInTheDocument();
      expect(screen.queryByText(/products/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/people/i)).not.toBeInTheDocument();
      expect(screen.getAllByRole("checkbox")).toHaveLength(7);
    });
  });

  describe("Native Query", () => {
    it("Should render values correctly", () => {
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
      expect(screen.getByRole("checkbox", { name: /Subtotal/i })).toBeChecked();
      expect(
        screen.getByRole("checkbox", { name: /product_id/i }),
      ).not.toBeChecked();
    });

    it("should add a column", () => {
      const onChange = jest.fn();
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
        onChange,
        ...NATIVE_QUERY_PROPS,
      });
      const ADD = screen.getByRole("checkbox", { name: /product_id/i });

      fireEvent.click(ADD);
      expect(onChange.mock.calls).toEqual([
        [
          [
            {
              fieldRef: ["field", "SUBTOTAL", { "base-type": "type/Float" }],
              enabled: true,
            },
            {
              fieldRef: [
                "field",
                "PRODUCT_ID",
                { "base-type": "type/Integer" },
              ],
              enabled: true,
            },
          ],
        ],
      ]);
    });

    it("should remove a column", () => {
      const onChange = jest.fn();
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
        onChange,
        ...NATIVE_QUERY_PROPS,
      });
      fireEvent.click(screen.getByRole("checkbox", { name: /Subtotal/i }));
      expect(onChange.mock.calls).toEqual([
        [
          [
            {
              fieldRef: ["field", "SUBTOTAL", { "base-type": "type/Float" }],
              enabled: false,
            },
            {
              fieldRef: [
                "field",
                "PRODUCT_ID",
                { "base-type": "type/Integer" },
              ],
              enabled: false,
            },
          ],
        ],
      ]);
    });

    it("should properly show bulk actions - Deselect All", () => {
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

      expect(screen.getByTestId("bulk-action-Columns")).toHaveTextContent(
        "Deselect All",
      );
    });

    it("should properly show bulk actions - Select All", () => {
      renderChartSettingOrderedColumns({
        value: [
          {
            fieldRef: ["field", "SUBTOTAL", { "base-type": "type/Float" }],
            enabled: false,
          },
          {
            fieldRef: ["field", "PRODUCT_ID", { "base-type": "type/Integer" }],
            enabled: false,
          },
        ],
        ...NATIVE_QUERY_PROPS,
      });

      expect(screen.getByTestId("bulk-action-Columns")).toHaveTextContent(
        "Select All",
      );
    });

    it("should bulk enable", () => {
      const onChange = jest.fn();
      renderChartSettingOrderedColumns({
        value: [
          {
            fieldRef: ["field", "SUBTOTAL", { "base-type": "type/Float" }],
            enabled: false,
          },
          {
            fieldRef: ["field", "PRODUCT_ID", { "base-type": "type/Integer" }],
            enabled: false,
          },
        ],
        onChange,
        ...NATIVE_QUERY_PROPS,
      });

      //Because the order of the columns is preserved and all new fields are appended, we need to exclude these
      const EXPECTED = NATIVE_QUERY_PROPS.columns
        .filter(
          column => column.name !== "SUBTOTAL" && column.name !== "PRODUCT_ID",
        )
        .map(column => ({
          enabled: true,
          fieldRef: ["field", column.name, { "base-type": column.base_type }],
        }));

      const bulkActionButton = screen.getByTestId("bulk-action-Columns");

      expect(bulkActionButton).toHaveTextContent("Select All");

      fireEvent.click(bulkActionButton);

      expect(onChange).toHaveBeenCalledWith([
        {
          fieldRef: ["field", "SUBTOTAL", { "base-type": "type/Float" }],
          enabled: true,
        },
        {
          fieldRef: ["field", "PRODUCT_ID", { "base-type": "type/Integer" }],
          enabled: true,
        },
        ...EXPECTED,
      ]);
    });

    it("should bulk disable", () => {
      const onChange = jest.fn();
      renderChartSettingOrderedColumns({
        value: [
          {
            fieldRef: ["field", "SUBTOTAL", { "base-type": "type/Float" }],
            enabled: true,
          },
          {
            fieldRef: ["field", "PRODUCT_ID", { "base-type": "type/Integer" }],
            enabled: true,
          },
          {
            fieldRef: ["field", "TAX", { "base-type": "type/Float" }],
            enabled: true,
          },
        ],
        ...NATIVE_QUERY_PROPS,
        onChange,
      });

      const bulkActionButton = screen.getByTestId("bulk-action-Columns");

      expect(bulkActionButton).toHaveTextContent("Deselect All");

      fireEvent.click(bulkActionButton);

      expect(onChange).toHaveBeenCalledWith([
        {
          fieldRef: ["field", "SUBTOTAL", { "base-type": "type/Float" }],
          enabled: false,
        },
        {
          fieldRef: ["field", "PRODUCT_ID", { "base-type": "type/Integer" }],
          enabled: false,
        },
        {
          fieldRef: ["field", "TAX", { "base-type": "type/Float" }],
          enabled: false,
        },
      ]);
    });

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
