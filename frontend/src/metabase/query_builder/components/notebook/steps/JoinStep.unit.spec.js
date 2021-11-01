/* eslint-disable react/prop-types */
import React, { useState } from "react";
import {
  renderWithProviders,
  screen,
  fireEvent,
  within,
  waitForElementToBeRemoved,
} from "__support__/ui";
import userEvent from "@testing-library/user-event";
import xhrMock from "xhr-mock";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import {
  ORDERS,
  PRODUCTS,
  SAMPLE_DATASET,
} from "__support__/sample_dataset_fixture";
import JoinStep from "./JoinStep";

// Workaround for timeouts on CI
jest.setTimeout(15000);

describe("Notebook Editor > Join Step", () => {
  const TEST_QUERY = {
    type: "query",
    database: SAMPLE_DATASET.id,
    query: {
      "source-table": ORDERS.id,
    },
  };

  function JoinStepWrapped({ initialQuery, onChange, ...props }) {
    const [query, setQuery] = useState(initialQuery);
    return (
      <JoinStep
        {...props}
        query={query}
        updateQuery={datasetQuery => {
          const newQuery = query.setDatasetQuery(datasetQuery);
          setQuery(newQuery);
          onChange(datasetQuery);
        }}
      />
    );
  }

  async function setup({ joinTable } = {}) {
    const query = new StructuredQuery(ORDERS.question(), TEST_QUERY);
    const onQueryChange = jest.fn();

    const TEST_STEP = {
      id: "0:join",
      type: "join",
      itemIndex: 0,
      stageIndex: 0,
      query,
      valid: true,
      visible: true,
      active: true,
      actions: [],
      update: jest.fn(),
      clean: jest.fn(),
      revert: jest.fn(),
    };

    renderWithProviders(
      <JoinStepWrapped
        initialQuery={query}
        step={TEST_STEP}
        onChange={onQueryChange}
      />,
      { withSampleDataset: true },
    );

    if (joinTable) {
      await selectTable(new RegExp(joinTable, "i"));
    }

    return { onQueryChange };
  }

  function toFieldRef(field, joinedTable) {
    if (!field) {
      return null;
    }
    return [
      "field",
      field.id,
      joinedTable ? { "join-alias": joinedTable.display_name } : null,
    ];
  }

  function expectedJoin({
    fields = "all",
    joinedTable,
    leftField,
    rightField,
  }) {
    const joinFields = Array.isArray(fields)
      ? fields.map(field => toFieldRef(field, joinedTable))
      : fields;

    return {
      ...TEST_QUERY,
      query: {
        ...TEST_QUERY.query,
        joins: [
          expect.objectContaining({
            fields: joinFields,
            "source-table": joinedTable.id,
            condition: [
              "=",
              toFieldRef(leftField),
              toFieldRef(rightField, joinedTable),
            ],
          }),
        ],
      },
    };
  }

  function expectedMultiFieldsJoin({
    fields = "all",
    joinedTable,
    dimensions,
  }) {
    const joinFields = Array.isArray(fields)
      ? fields.map(field => toFieldRef(field, joinedTable))
      : fields;

    const condition = ["and"];
    dimensions.forEach(pair => {
      const [leftField, rightField] = pair;
      condition.push([
        "=",
        toFieldRef(leftField),
        toFieldRef(rightField, joinedTable),
      ]);
    });

    return {
      ...TEST_QUERY,
      query: {
        ...TEST_QUERY.query,
        joins: [
          expect.objectContaining({
            fields: joinFields,
            "source-table": joinedTable.id,
            condition,
          }),
        ],
      },
    };
  }

  async function selectTable(tableName) {
    await waitForElementToBeRemoved(() => screen.queryByText("Loading..."));
    fireEvent.click(screen.queryByText(/Sample Dataset/i));
    const dataSelector = await screen.findByTestId("data-selector");
    fireEvent.click(within(dataSelector).queryByText(tableName));

    await waitForElementToBeRemoved(() =>
      screen.queryByTestId("data-selector"),
    );
  }

  function openDimensionPicker(type) {
    const openPickerButton = screen.getByTestId(`${type}-dimension`);
    fireEvent.click(openPickerButton);
    return screen.findByRole("rowgroup");
  }

  beforeEach(() => {
    xhrMock.setup();
    xhrMock.get("/api/database", {
      body: JSON.stringify({
        total: 1,
        data: [SAMPLE_DATASET.getPlainObject()],
      }),
    });
    xhrMock.get("/api/database/1/schemas", {
      body: JSON.stringify(["PUBLIC"]),
    });
    xhrMock.get("/api/database/1/schema/PUBLIC", {
      body: JSON.stringify(
        SAMPLE_DATASET.tables.filter(table => table.schema === "PUBLIC"),
      ),
    });
    xhrMock.get("/api/search?models=dataset&limit=1", {
      body: JSON.stringify({
        data: [],
        limit: 1,
        models: ["dataset"],
        offset: 0,
        total: 0,
      }),
    });
  });

  afterEach(() => {
    xhrMock.teardown();
  });

  it("displays a source table and suggests to pick a join table", async () => {
    await setup();
    expect(screen.queryByText("Orders")).toBeInTheDocument();
    expect(screen.queryByText("Pick a table...")).toBeInTheDocument();
  });

  it("opens a schema browser by default", async () => {
    await setup();
    await waitForElementToBeRemoved(() => screen.queryByText("Loading..."));

    fireEvent.click(screen.queryByText(/Sample Dataset/i));
    const dataSelector = await screen.findByTestId("data-selector");

    SAMPLE_DATASET.tables.forEach(table => {
      const tableName = new RegExp(table.display_name, "i");
      expect(within(dataSelector).queryByText(tableName)).toBeInTheDocument();
    });
  });

  it("automatically sets join fields if possible", async () => {
    const { onQueryChange } = await setup();

    await selectTable(/Products/i);

    expect(screen.getByTestId("parent-dimension")).toHaveTextContent(
      /Product ID/i,
    );
    expect(screen.getByTestId("join-dimension")).toHaveTextContent(/ID/i);
    expect(onQueryChange).toHaveBeenLastCalledWith(
      expectedJoin({
        joinedTable: PRODUCTS,
        leftField: ORDERS.PRODUCT_ID,
        rightField: PRODUCTS.ID,
      }),
    );
  });

  it("shows a parent dimension's join field picker", async () => {
    const ordersFields = Object.values(ORDERS.fieldsLookup());
    await setup({ joinTable: "Products" });

    fireEvent.click(screen.getByTestId("parent-dimension"));

    const picker = await screen.findByRole("rowgroup");
    expect(picker).toBeInTheDocument();
    expect(picker).toBeVisible();
    expect(within(picker).queryByText("Order")).toBeInTheDocument();
    ordersFields.forEach(field => {
      expect(
        within(picker).queryByText(field.display_name),
      ).toBeInTheDocument();
    });
  });

  it("can change parent dimension's join field", async () => {
    const { onQueryChange } = await setup({ joinTable: "Products" });
    const picker = await openDimensionPicker("parent");

    fireEvent.click(within(picker).getByText("Tax"));

    expect(onQueryChange).toHaveBeenLastCalledWith(
      expectedJoin({
        joinedTable: PRODUCTS,
        leftField: ORDERS.TAX,
        rightField: PRODUCTS.ID,
      }),
    );
  });

  it("shows a join dimension's field picker", async () => {
    const productsFields = Object.values(PRODUCTS.fieldsLookup());
    await setup({ joinTable: "Products" });

    fireEvent.click(screen.getByTestId("join-dimension"));

    const picker = await screen.findByRole("rowgroup");
    expect(picker).toBeInTheDocument();
    expect(picker).toBeVisible();
    expect(within(picker).queryByText("Product")).toBeInTheDocument();
    productsFields.forEach(field => {
      expect(
        within(picker).queryByText(field.display_name),
      ).toBeInTheDocument();
    });
  });

  it("can change join dimension's field", async () => {
    const { onQueryChange } = await setup({ joinTable: "Products" });
    const picker = await openDimensionPicker("join");

    fireEvent.click(within(picker).getByText("Category"));

    expect(onQueryChange).toHaveBeenLastCalledWith(
      expectedJoin({
        joinedTable: PRODUCTS,
        leftField: ORDERS.PRODUCT_ID,
        rightField: PRODUCTS.CATEGORY,
      }),
    );
  });

  it("automatically opens dimensions picker if can't automatically set join fields", async () => {
    await setup({ joinTable: "Reviews" });

    const picker = await screen.findByRole("rowgroup");
    expect(picker).toBeInTheDocument();
    expect(picker).toBeVisible();
    expect(within(picker).queryByText("Order")).toBeInTheDocument();
  });

  it("can select fields to select from a joined table", async () => {
    const { onQueryChange } = await setup({ joinTable: "Products" });

    fireEvent.click(screen.getByLabelText("table icon"));
    fireEvent.click(screen.getByText("Select None"));
    fireEvent.click(screen.getByText("Category"));

    expect(onQueryChange).toHaveBeenLastCalledWith(
      expectedJoin({
        joinedTable: PRODUCTS,
        leftField: ORDERS.PRODUCT_ID,
        rightField: PRODUCTS.ID,
        fields: [PRODUCTS.CATEGORY],
      }),
    );
  });

  it("can clear selected parent dimension", async () => {
    const { onQueryChange } = await setup({ joinTable: "Products" });
    const parentDimensionPicker = screen.getByTestId("parent-dimension");

    fireEvent.click(
      within(parentDimensionPicker).queryByLabelText("close icon"),
    );

    expect(screen.getByTestId("parent-dimension")).toHaveTextContent(
      "Pick a column...",
    );
    expect(screen.queryByRole("rowgroup")).toBe(null);
    expect(onQueryChange).toHaveBeenLastCalledWith(
      expectedJoin({
        joinedTable: PRODUCTS,
        rightField: PRODUCTS.ID,
      }),
    );
  });

  it("can clear selected join dimension", async () => {
    const { onQueryChange } = await setup({ joinTable: "Products" });
    const joinDimensionPicker = screen.getByTestId("join-dimension");

    fireEvent.click(within(joinDimensionPicker).queryByLabelText("close icon"));

    expect(screen.getByTestId("join-dimension")).toHaveTextContent(
      "Pick a column...",
    );
    expect(screen.queryByRole("rowgroup")).toBe(null);
    expect(onQueryChange).toHaveBeenLastCalledWith(
      expectedJoin({
        joinedTable: PRODUCTS,
        leftField: ORDERS.PRODUCT_ID,
      }),
    );
  });

  it("hides icons for removing dimensions if dimensions are not set yet", async () => {
    await setup({ joinTable: "Reviews" });

    expect(screen.queryAllByLabelText("close icon")).toHaveLength(0);
  });

  it("shows the fields picker tooltip on control hover", async () => {
    await setup({ joinTable: "Products" });

    userEvent.hover(screen.getByLabelText("table icon"));

    const tooltip = screen.queryByRole("tooltip");
    expect(tooltip).toBeInTheDocument();
    expect(tooltip).toHaveTextContent("Pick columns");
  });

  it("hides the fields picker tooltip when the picker opens", async () => {
    await setup({ joinTable: "Products" });

    userEvent.click(screen.getByLabelText("table icon"));
    userEvent.hover(screen.getByLabelText("table icon"));

    expect(screen.queryByRole("tooltip")).toBe(null);
  });

  it("shows temporal unit for date-time fields", async () => {
    await setup({ joinTable: "Products" });

    fireEvent.click(screen.getByTestId("parent-dimension"));
    let picker = await screen.findByRole("rowgroup");
    fireEvent.click(within(picker).queryByText("Created At"));
    fireEvent.click(screen.getByTestId("join-dimension"));
    picker = await screen.findByRole("rowgroup");
    fireEvent.click(within(picker).queryByText("Created At"));

    expect(screen.getByTestId("parent-dimension")).toHaveTextContent(
      "Created At: Day",
    );
    expect(screen.getByTestId("join-dimension")).toHaveTextContent(
      "Created At: Day",
    );
  });

  describe("joins on multiple fields", () => {
    it("does not display a new dimensions pair control until first pair is valid", async () => {
      await setup({ joinTable: "Reviews" });

      expect(screen.queryAllByText("Pick a column...")).toHaveLength(2);
      expect(screen.queryByLabelText("add icon")).toBe(null);
    });

    it("can add a new dimension pair", async () => {
      await setup({ joinTable: "Products" });

      fireEvent.click(screen.queryByLabelText("add icon"));

      expect(screen.queryAllByText("Pick a column...")).toHaveLength(2);
    });

    it("automatically opens a parent dimension picker for new fields pair", async () => {
      await setup({ joinTable: "Products" });

      fireEvent.click(screen.queryByLabelText("add icon"));

      const picker = await screen.findByRole("rowgroup");
      expect(picker).toBeInTheDocument();
      expect(picker).toBeVisible();
      expect(within(picker).queryByText("Order")).toBeInTheDocument();
    });

    it("automatically opens a join dimension picker for new fields pair", async () => {
      await setup({ joinTable: "Products" });

      fireEvent.click(screen.queryByLabelText("add icon"));
      let picker = await screen.findByRole("rowgroup");
      fireEvent.click(within(picker).queryByText("Created At"));

      picker = await screen.findByRole("rowgroup");
      expect(picker).toBeInTheDocument();
      expect(picker).toBeVisible();
      expect(within(picker).queryByText("Product")).toBeInTheDocument();
    });

    it("correctly updates join when adding multiple conditions", async () => {
      const { onQueryChange } = await setup({ joinTable: "Products" });
      fireEvent.click(screen.queryByLabelText("add icon"));

      let picker = await screen.findByRole("rowgroup");
      fireEvent.click(within(picker).queryByText("Tax"));
      picker = await screen.findByRole("rowgroup");
      fireEvent.click(within(picker).queryByText("Price"));

      expect(onQueryChange).toHaveBeenLastCalledWith(
        expectedMultiFieldsJoin({
          dimensions: [
            [ORDERS.PRODUCT_ID, PRODUCTS.ID],
            [ORDERS.TAX, PRODUCTS.PRICE],
          ],
          joinedTable: PRODUCTS,
        }),
      );
    });

    it("does not display a new dimensions pair control for a new empty pair", async () => {
      await setup({ joinTable: "Products" });

      fireEvent.click(screen.queryByLabelText("add icon"));

      expect(screen.queryByLabelText("add icon")).toBe(null);
    });

    it("can remove an empty dimension pair", async () => {
      await setup({ joinTable: "Products" });
      fireEvent.click(screen.queryByLabelText("add icon"));

      fireEvent.click(screen.queryByTestId("remove-dimension-pair"));

      expect(screen.queryAllByText("Pick a column...")).toEqual([]);
      expect(screen.getByTestId("parent-dimension")).toHaveTextContent(
        /Product ID/i,
      );
      expect(screen.getByTestId("join-dimension")).toHaveTextContent(/ID/i);
    });
  });
});
