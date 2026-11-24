import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { createMockMetadata } from "__support__/metadata";
import { renderWithProviders, screen, within } from "__support__/ui";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import type { VisualizationDisplay } from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { StructuredQueryRightSidebar } from "./StructuredQueryRightSidebar";

type WellId = "values" | "columns" | "rows";

const PIVOT_QUERY = Lib.createTestQuery(SAMPLE_PROVIDER, {
  stages: [
    {
      source: { type: "table", id: ORDERS_ID },
      aggregations: [{ type: "operator", operator: "count" }],
      breakouts: [
        { type: "column", name: "CREATED_AT", unit: "month" },
        {
          type: "column",
          sourceFieldId: ORDERS.PRODUCT_ID,
          name: "CATEGORY",
        },
        {
          type: "column",
          sourceFieldId: ORDERS.PRODUCT_ID,
          name: "VENDOR",
        },
      ],
    },
  ],
});

const setup = () => {
  const metadata = createMockMetadata({ databases: [createSampleDatabase()] });
  const pivotQuestion = new Question(
    createMockCard({
      display: "pivot",
      displayIsLocked: true,
      dataset_query: Lib.toJsQuery(PIVOT_QUERY),
      visualization_settings: {
        "pivot_table.column_split": {
          rows: ["VENDOR", "CREATED_AT"],
          columns: ["CATEGORY"],
          values: ["count"],
        },
      },
    }),
    metadata,
  );

  const QuestionView = () => {
    const [question, setQuestion] = useState(pivotQuestion);
    // the visualization picker changes the display this way
    const show = (display: VisualizationDisplay) =>
      setQuestion(question.setDisplay(display).lockDisplay());
    return (
      <>
        <button onClick={() => show("line")}>Show a line chart</button>
        <button onClick={() => show("pivot")}>Show a pivot table</button>
        <output aria-label="Visualization">{question.display()}</output>
        <StructuredQueryRightSidebar
          question={question}
          isShowingSummarySidebar
          isShowingTimelineSidebar={false}
          isShowingQuestionInfoSidebar={false}
          isShowingQuestionSettingsSidebar={false}
          updateQuestion={setQuestion}
          onSave={jest.fn()}
        />
      </>
    );
  };

  renderWithProviders(<QuestionView />);
};

const showLineChart = () =>
  userEvent.click(screen.getByRole("button", { name: "Show a line chart" }));

const showPivotTable = () =>
  userEvent.click(screen.getByRole("button", { name: "Show a pivot table" }));

function getWell(wellId: WellId) {
  return within(screen.getByTestId(`summary-well-${wellId}`));
}

function getChipLabels(wellId: WellId) {
  return getWell(wellId)
    .queryAllByTestId("summary-well-item")
    .map((chip) => chip.textContent);
}

async function pickOption(label: string, searchText: string, name: string) {
  await userEvent.type(screen.getByLabelText(label), searchText);
  const options = await screen.findAllByRole("option");
  const option = options.find((option) => option.textContent === name);
  if (option == null) {
    throw new Error(`No ${name} option`);
  }
  await userEvent.click(option);
}

function expectPivotWells() {
  expect(getWell("values").getByText("Values")).toBeInTheDocument();
  expect(getWell("columns").getByText("Columns")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Back to breakouts" }),
  ).toBeInTheDocument();
}

describe("StructuredQueryRightSidebar and the visualization", () => {
  it("moves the Rows groupings to Group by while another visualization shows, and back to Rows with the pivot table", async () => {
    setup();
    expectPivotWells();
    expect(getChipLabels("rows")).toEqual([
      "Product → Vendor",
      "Created At: Month",
    ]);
    expect(getChipLabels("columns")).toEqual(["Product → Category"]);

    await showLineChart();

    expect(screen.queryByTestId("summary-well-rows")).not.toBeInTheDocument();
    expect(getWell("values").getByText("Summarize by")).toBeInTheDocument();
    expect(getWell("columns").getByText("Group by")).toBeInTheDocument();
    expect(getChipLabels("columns")).toEqual([
      "Created At: Month",
      "Product → Category",
      "Product → Vendor",
    ]);
    expect(getChipLabels("values")).toEqual(["Count"]);
    expect(
      screen.getByRole("button", { name: "Pivot into rows and columns" }),
    ).toBeInTheDocument();

    await showPivotTable();

    expectPivotWells();
    expect(getChipLabels("rows")).toEqual([
      "Product → Vendor",
      "Created At: Month",
    ]);
    expect(getChipLabels("columns")).toEqual(["Product → Category"]);
    expect(getChipLabels("values")).toEqual(["Count"]);
  });

  it("keeps the other visualization while the wells change, and shows what was added in the pivot wells afterwards", async () => {
    setup();
    await showLineChart();

    await pickOption("Add a grouping by name", "sourc", "Source");
    await pickOption("Add a value by name", "quant", "Quantity");

    expect(screen.getByLabelText("Visualization")).toHaveTextContent("line");
    expect(screen.queryByTestId("summary-well-rows")).not.toBeInTheDocument();
    expect(getChipLabels("columns")).toEqual([
      "Created At: Month",
      "Product → Category",
      "Product → Vendor",
      "User → Source",
    ]);

    await showPivotTable();

    expectPivotWells();
    expect(getChipLabels("rows")).toEqual([
      "Product → Vendor",
      "Created At: Month",
      "User → Source",
    ]);
    expect(getChipLabels("columns")).toEqual(["Product → Category"]);
    expect(getChipLabels("values")).toEqual(["Count", "Sum of Quantity"]);
  });

  it("leaves out what was removed under another visualization when the pivot table shows again", async () => {
    setup();
    await showLineChart();

    await userEvent.click(
      screen.getByRole("button", { name: "Remove Product → Vendor" }),
    );

    expect(screen.getByLabelText("Visualization")).toHaveTextContent("line");

    await showPivotTable();

    expectPivotWells();
    expect(getChipLabels("rows")).toEqual(["Created At: Month"]);
    expect(getChipLabels("columns")).toEqual(["Product → Category"]);
    expect(getChipLabels("values")).toEqual(["Count"]);
  });
});
