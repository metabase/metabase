import React from "react";
import { getIn } from "icepick";
import { render, screen, fireEvent, within } from "@testing-library/react";
import {
  ORDERS,
  PRODUCTS,
  PEOPLE,
  SAMPLE_DATABASE,
  metadata,
} from "__support__/sample_database_fixture";
import ChartSettingColumnEditor from "metabase/visualizations/components/settings/ChartSettingColumnEditor";
import { formatColumn } from "metabase/lib/formatting";
import { getColumnKey } from "metabase-lib/queries/utils/get-column-key";

import Question from "metabase-lib/Question";

function renderChartSettingOrderedColumns(props) {
  const getCustomColumnName = (column, _onlyCustom) => {
    return formatColumn(column);
  };

  render(
    <ChartSettingColumnEditor
      onChange={() => {}}
      getCustomColumnName={getCustomColumnName}
      {...props}
    />,
  );
}

const toNativeColumn = column => ({
  base_type: column.base_type,
  display_name: column.name,
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
    it("Should show source tables in aggreated columns", () => {
      const question = new Question(
        {
          dataset_query: {
            type: "query",
            query: {
              aggregation: [["count"]],
              breakout: [
                ["field", ORDERS.CREATED_AT.id, { "temporal-unit": "year" }],
                [
                  "field",
                  PRODUCTS.CREATED_AT.id,
                  {
                    "temporal-unit": "year",
                    "source-field": ORDERS.PRODUCT_ID.id,
                  },
                ],
              ],
              "source-table": ORDERS.id,
            },
            database: SAMPLE_DATABASE.id,
          },
        },
        metadata,
      );
      const columns = [
        ORDERS.CREATED_AT.dimension().column(),
        // Normally, the column display name would come back with the result data, but in our test here
        // This isn't quite right, but We just want to confirm that we're getting the name from the
        // column data, and not the dimension
        {
          ...PRODUCTS.CREATED_AT.dimension().column(),
          display_name: PRODUCTS.CREATED_AT.dimension()
            .field()
            .displayName({ includeTable: true }),
        },
        {
          base_type: "type/BigInteger",
          display_name: "Count",
          name: "count",
          field_ref: ["aggregation", 0],
          source: "aggregation",
        },
      ];
      const onChange = jest.fn();
      renderChartSettingOrderedColumns({
        value: [],
        columns,
        question,
        onChange,
      });

      expect(screen.getByText("Products → Created At")).toBeInTheDocument();
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

  describe("Custom Column Names", () => {
    const setup = props => {
      const columns = [
        ORDERS.TOTAL.dimension().column(),
        ORDERS.TAX.dimension().column(),
        ORDERS.ID.dimension().column(),
        {
          ...PEOPLE.NAME.dimension().column(),
          field_ref: [
            "field",
            PEOPLE.NAME.id,
            { "source-field": ORDERS.USER_ID.id },
          ],
          display_name: "User → Name",
          source_alias: "PEOPLE__via__USER_ID",
        },
        {
          ...PEOPLE.CITY.dimension().column(),
          field_ref: [
            "field",
            PEOPLE.CITY.id,
            { "source-field": ORDERS.USER_ID.id },
          ],
          display_name: "User → City",
          source_alias: "PEOPLE__via__USER_ID",
        },
      ];

      const column_settings = {
        [getColumnKey(columns[1])]: {
          column_title: "Homies Tax",
        },
        [getColumnKey(columns[4])]: {
          column_title: "Homies Hood",
        },
        [getColumnKey(columns[2])]: {
          column_title: "",
        },
      };

      const vizSettings = {
        column_settings,
        "table.columns": columns.map(column => ({
          fieldRef: column.field_ref,
          enabled: true,
          name: column.name,
        })),
      };

      const question = new Question(
        {
          dataset_query: {
            database: SAMPLE_DATABASE.id,
            query: {
              fields: columns.map(col => col.field_ref),
              "source-table": ORDERS.id,
            },
            type: "query",
          },
          vizSettings,
        },

        metadata,
      );

      const getCustomColumnName = (column, onlyCustom) => {
        const customName = getIn(column_settings, [
          getColumnKey(column),
          "column_title",
        ]);

        if (customName || onlyCustom) {
          return customName;
        }
        return formatColumn(column);
      };

      render(
        <ChartSettingColumnEditor
          onChange={() => {}}
          getCustomColumnName={getCustomColumnName}
          columns={columns}
          question={question}
          value={vizSettings["table.columns"]}
          {...props}
        />,
      );
    };

    it("should use the correct column names in correct situations - query builder", () => {
      setup();

      //Source table should be applying custom names, then column names
      expect(
        within(screen.getByTestId("Orders-columns")).getByLabelText("Total"),
      ).toBeChecked();
      expect(
        within(screen.getByTestId("Orders-columns")).getByLabelText(
          "Homies Tax",
        ),
      ).toBeChecked();

      // If the Custom name is empty, it should fall back to the column name
      expect(
        within(screen.getByTestId("Orders-columns")).getByLabelText("ID"),
      ).toBeChecked();

      //Other tables should be applying custom names, then dimension names
      expect(
        within(screen.getByTestId("People-columns")).getByLabelText(
          "Homies Hood",
        ),
      ).toBeChecked();
      expect(
        within(screen.getByTestId("People-columns")).getByLabelText("Name"),
      ).toBeChecked();
    });

    it("should use the correct column names in correct situations - dashboard", () => {
      setup({ isDashboard: true });

      //Dashboards only show columns in one group. Should apply custom names, then column names.
      expect(
        within(screen.getByTestId("Orders-columns")).getByLabelText("Total"),
      ).toBeChecked();
      expect(
        within(screen.getByTestId("Orders-columns")).getByLabelText(
          "Homies Tax",
        ),
      ).toBeChecked();

      expect(
        within(screen.getByTestId("Orders-columns")).getByLabelText(
          "Homies Hood",
        ),
      ).toBeChecked();
      expect(
        within(screen.getByTestId("Orders-columns")).getByLabelText(
          "User → Name",
        ),
      ).toBeChecked();
    });
  });
});
