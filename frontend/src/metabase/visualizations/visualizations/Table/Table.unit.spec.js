import userEvent from "@testing-library/user-event";
import { thaw } from "icepick";
import { useState } from "react";

import { createMockMetadata } from "__support__/metadata";
import { renderWithProviders, screen, within } from "__support__/ui";
import { QuestionChartSettings } from "metabase/visualizations/components/ChartSettings";
import registerVisualizations from "metabase/visualizations/register";
import { Table } from "metabase/visualizations/visualizations/Table/Table";
import Question from "metabase-lib/v1/Question";
import {
  createMockCard,
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
  createMockSingleSeries,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  SAMPLE_DB_ID,
  createOrdersTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

registerVisualizations();

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});
const ordersTable = createOrdersTable();
const ordersFields = ordersTable.fields ?? [];

const setup = ({ display, visualization_settings = {} }) => {
  const onChange = jest.fn();

  const Container = () => {
    const [question, setQuestion] = useState(
      new Question(
        {
          dataset_query: {
            type: "query",
            query: {
              "source-table": ORDERS_ID,
            },
            database: SAMPLE_DB_ID,
          },
          display,
          visualization_settings,
        },
        metadata,
      ),
    );

    const handleChange = (update) => {
      onChange(update);
      setQuestion((q) => {
        const newQuestion = q.updateSettings(update);
        return new Question(thaw(newQuestion.card()), metadata);
      });
    };

    return (
      <QuestionChartSettings
        onChange={handleChange}
        series={[
          {
            card: question.card(),
            data: {
              rows: [],
              cols: ordersFields.map((field) =>
                createMockColumn({
                  ...field,
                  id: Number(field.id),
                  source: "fields",
                  field_ref: ["field", Number(field.id), null],
                }),
              ),
            },
          },
        ]}
        initial={{ section: "Data" }}
        noPreview
        question={question}
      />
    );
  };

  renderWithProviders(<Container />);

  return { onChange };
};

// these visualizations share column settings, so all the tests should work for both
["table", "object"].forEach((display) => {
  describe(`${display} column settings`, () => {
    it("should show you related columns in structured queries", async () => {
      setup({ display });
      await userEvent.click(screen.getByText("Add or remove columns"));

      expect(screen.getByText("User")).toBeInTheDocument();
      expect(screen.getByText("Product")).toBeInTheDocument();

      const userColumList = screen.getByTestId("user-table-columns");

      expect(within(userColumList).getByLabelText("Address")).not.toBeChecked();
      expect(within(userColumList).getByLabelText("State")).not.toBeChecked();
    });

    it("should allow you to show and hide columns", async () => {
      setup({ display });
      await userEvent.click(await screen.findByTestId("Tax-hide-button"));

      expect(
        await screen.findByRole("listitem", { name: "Tax" }),
      ).toHaveAttribute("data-enabled", "false");

      await userEvent.click(await screen.findByTestId("Tax-show-button"));
      //If we can see the hide button, then we know it's been added back in.
      expect(await screen.findByTestId("Tax-hide-button")).toBeInTheDocument();
    });

    it("should allow you to update a column name", async () => {
      setup({ display });
      await userEvent.click(
        await screen.findByTestId("Subtotal-settings-button"),
      );
      await userEvent.type(
        await screen.findByDisplayValue("Subtotal"),
        " Updated",
      );
      await userEvent.click(await screen.findByText("Tax"));
      expect(await screen.findByText("Subtotal Updated")).toBeInTheDocument();
    });

    it("should rewrite field ref-based column_settings keys to name-based keys on update", async () => {
      const { onChange } = setup({
        display,
        visualization_settings: createMockVisualizationSettings({
          column_settings: {
            [JSON.stringify(["ref", ["field", ORDERS.TOTAL, null]])]: {
              column_title: "Total1",
            },
            [JSON.stringify(["ref", ["field", ORDERS.SUBTOTAL, null]])]: {
              column_title: "Subtotal1",
            },
          },
        }),
      });
      await userEvent.click(
        await screen.findByTestId("Subtotal1-settings-button"),
      );
      const input = await screen.findByDisplayValue("Subtotal1");
      await userEvent.clear(input);
      await userEvent.type(input, "Subtotal2");
      await userEvent.click(await screen.findByText("Total1"));
      expect(onChange).toHaveBeenCalledWith({
        column_settings: {
          [JSON.stringify(["name", "TOTAL"])]: { column_title: "Total1" },
          [JSON.stringify(["name", "SUBTOTAL"])]: { column_title: "Subtotal2" },
        },
      });
    });
  });
});

describe("table.pivot", () => {
  describe("getHidden", () => {
    const createMockSeriesWithCols = (cols) => [
      createMockSingleSeries(
        createMockCard(),
        createMockDataset({
          data: createMockDatasetData({
            cols: cols.map((name) => createMockColumn({ name })),
          }),
        }),
      ),
    ];

    const threeCols = createMockSeriesWithCols(["dim1", "dim2", "metric"]);
    const fourCols = createMockSeriesWithCols([
      "dim1",
      "dim2",
      "dim3",
      "metric",
    ]);

    it("should be hidden when table.pivot is false and cols.length is not 3", () => {
      const isHidden = Table.settings["table.pivot"].getHidden(fourCols, {
        "table.pivot": false,
      });

      expect(isHidden).toBe(true);
    });

    it("should not be hidden when table.pivot is true, regardless of cols.length", () => {
      const isHidden = Table.settings["table.pivot"].getHidden(fourCols, {
        "table.pivot": true,
      });

      expect(isHidden).toBe(false);
    });

    it("should not be hidden when cols.length is 3 and table.pivot is false", () => {
      const isHidden = Table.settings["table.pivot"].getHidden(threeCols, {
        "table.pivot": false,
      });

      expect(isHidden).toBe(false);
    });
  });
});

describe("text_wrapping", () => {
  describe("in columnSettings", () => {
    const createMockStringColumn = () =>
      createMockColumn({ base_type: "type/Text" });

    const createMockNumberColumn = () =>
      createMockColumn({ base_type: "type/Number" });

    it("should be available for string columns", () => {
      const stringColumn = createMockStringColumn();
      const settings = Table.columnSettings(stringColumn);

      expect(settings["text_wrapping"]).toBeDefined();
    });

    it("should not be available for non-string columns", () => {
      const numberColumn = createMockNumberColumn();
      const settings = Table.columnSettings(numberColumn);

      expect(settings["text_wrapping"]).toBeUndefined();
    });

    it("should be hidden when view_as is image", () => {
      const stringColumn = createMockStringColumn();
      const settings = Table.columnSettings(stringColumn);

      const isHidden = settings["text_wrapping"].getHidden(stringColumn, {
        view_as: "image",
      });

      expect(isHidden).toBe(true);
    });

    it("should be not valid when view_as is image", () => {
      const stringColumn = createMockStringColumn();
      const settings = Table.columnSettings(stringColumn);

      const isValid = settings["text_wrapping"].isValid(stringColumn, {
        view_as: "image",
      });

      expect(isValid).toBe(false);
    });

    it("should be visible when view_as is null", () => {
      const stringColumn = createMockStringColumn();
      const settings = Table.columnSettings(stringColumn);

      const isHidden = settings["text_wrapping"].getHidden(stringColumn, {
        view_as: null,
      });

      expect(isHidden).toBe(false);
    });

    it("should be visible when view_as is auto", () => {
      const stringColumn = createMockStringColumn();
      const settings = Table.columnSettings(stringColumn);

      const isHidden = settings["text_wrapping"].getHidden(stringColumn, {
        view_as: "auto",
      });

      expect(isHidden).toBe(false);
    });

    it("should be visible when view_as is link", () => {
      const stringColumn = createMockStringColumn();
      const settings = Table.columnSettings(stringColumn);

      const isHidden = settings["text_wrapping"].getHidden(stringColumn, {
        view_as: "link",
      });

      expect(isHidden).toBe(false);
    });

    it("should be valid when view_as is link", () => {
      const stringColumn = createMockStringColumn();
      const settings = Table.columnSettings(stringColumn);

      const isValid = settings["text_wrapping"].isValid(stringColumn, {
        view_as: "link",
      });

      expect(isValid).toBe(true);
    });

    it("should default to false", () => {
      const stringColumn = createMockStringColumn();
      const settings = Table.columnSettings(stringColumn);

      expect(settings["text_wrapping"].default).toBe(false);
    });
  });
});
