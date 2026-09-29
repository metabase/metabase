import { renderWithProviders, screen } from "__support__/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import { registerVisualizations } from "metabase/visualizations/register";
import { loadVisualizationComponents } from "metabase/viz-core";
import type { RowValues } from "metabase-types/api";
import {
  createMockCard,
  createMockCategoryColumn,
  createMockDatasetData,
  createMockNumericColumn,
  createMockSingleSeries,
} from "metabase-types/api/mocks";

registerVisualizations();

beforeAll(() => loadVisualizationComponents(["funnel"]));

const ROWS: RowValues[] = [
  ["Awareness", 1000],
  ["Consideration", 600],
  ["Purchase", 200],
];

const TRANSLATED_ROWS: RowValues[] = [
  ["Povědomí", 1000],
  ["Zvažování", 600],
  ["Nákup", 200],
];

type SetupOpts = {
  rows: RowValues[];
  untranslatedRows?: RowValues[];
};

function setup({ rows, untranslatedRows }: SetupOpts) {
  const series = [
    createMockSingleSeries(createMockCard({ display: "funnel" }), {
      data: createMockDatasetData({
        cols: [
          createMockCategoryColumn({ name: "STEP", display_name: "Step" }),
          createMockNumericColumn({ name: "count", display_name: "Count" }),
        ],
        rows,
        untranslatedRows,
      }),
    }),
  ];

  renderWithProviders(
    <Visualization rawSeries={series} width={600} height={400} />,
  );
}

function getStepLabels() {
  return screen
    .queryAllByTestId("funnel-chart-header")
    .map((header) => header.textContent);
}

function expectStepValues() {
  expect(screen.getByText("1,000")).toBeInTheDocument();
  expect(screen.getByText("600")).toBeInTheDocument();
  expect(screen.getByText("60.00 %")).toBeInTheDocument();
  expect(screen.getByText("200")).toBeInTheDocument();
  expect(screen.getByText("20.00 %")).toBeInTheDocument();
}

describe("FunnelNormal", () => {
  it("should render a step for each row with its label and value", () => {
    setup({ rows: ROWS });

    expect(getStepLabels()).toEqual(["Awareness", "Consideration", "Purchase"]);
    expectStepValues();
  });

  it("should render the translated step labels when dimension values are translated (metabase#71488)", () => {
    setup({ rows: TRANSLATED_ROWS, untranslatedRows: ROWS });

    expect(getStepLabels()).toEqual(["Povědomí", "Zvažování", "Nákup"]);
    expectStepValues();
  });
});
