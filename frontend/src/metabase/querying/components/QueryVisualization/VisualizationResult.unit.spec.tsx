import userEvent from "@testing-library/user-event";

import { createMockMetadata } from "__support__/metadata";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  within,
} from "__support__/ui";
import { registerVisualizations } from "metabase/visualizations/register";
import { loadVisualizationComponents } from "metabase/viz-core";
import Question from "metabase-lib/v1/Question";
import {
  createMockDataset,
  createMockDatasetData,
} from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  SAMPLE_DB_ID,
  createOrdersIdDatasetColumn,
  createOrdersTotalDatasetColumn,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { Mode } from "../../click-actions/Mode";
import { defaultClickActionMode } from "../../click-actions/lib/modes";
import { DefaultMode } from "../../click-actions/modes/DefaultMode";

import { VisualizationResult } from "./VisualizationResult";
import type { QueryVisualizationProps } from "./types";

registerVisualizations();

// Chart components are loaded on demand. Register them up front so each test
// renders in one pass and can be run on its own.
beforeAll(() => {
  mockGetBoundingClientRect();
  return loadVisualizationComponents(["table"]);
});

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});

const setup = (props: Partial<QueryVisualizationProps> = {}) => {
  const question = new Question(
    {
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
        },
        database: SAMPLE_DB_ID,
      },
      display: "table",
      visualization_settings: {},
    },
    metadata,
  );

  const data = createMockDatasetData({
    cols: [createOrdersIdDatasetColumn(), createOrdersTotalDatasetColumn()],
    rows: [
      [1, 10],
      [2, 20],
    ],
  });

  renderWithProviders(
    <VisualizationResult
      question={question}
      result={createMockDataset({ data })}
      rawSeries={[{ card: question.card(), data }]}
      // VisualizationResult passes this on as onChangeCardAndRun, which the click actions popover needs to render.
      navigateToNewCardInsideQB={jest.fn()}
      {...props}
    />,
  );
};

const expectColumnReorderingDisabled = async () => {
  const header = await screen.findByRole("columnheader", { name: "Total" });
  // dnd-kit renders a draggable header as a button.
  expect(within(header).queryByRole("button")).not.toBeInTheDocument();
};

describe("VisualizationResult", () => {
  describe("without hasColumnReordering", () => {
    it("should disable column reordering", async () => {
      setup();

      await expectColumnReorderingDisabled();
    });

    it("should disable column reordering with an explicit mode", async () => {
      setup({ mode: defaultClickActionMode });

      await expectColumnReorderingDisabled();
    });

    it("should show click actions on a cell click", async () => {
      setup();

      const cells = await screen.findAllByRole("gridcell");
      await userEvent.click(cells[cells.length - 1]);

      expect(
        await screen.findByTestId("click-actions-view"),
      ).toBeInTheDocument();
    });
  });

  describe("with hasColumnReordering", () => {
    it("should enable column reordering", async () => {
      setup({ hasColumnReordering: true });

      const header = await screen.findByRole("columnheader", { name: "Total" });
      expect(within(header).getByRole("button")).toHaveAttribute(
        "aria-roledescription",
        "sortable",
      );
    });
  });

  describe("with the default mode", () => {
    it("should hide the add-column shortcut", async () => {
      setup({ mode: defaultClickActionMode });

      await screen.findByRole("columnheader", { name: "Total" });
      expect(
        screen.queryByRole("button", { name: "Add column" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("with hasColumnShortcutActions", () => {
    it("should show the add-column shortcut", async () => {
      setup({
        mode: new Mode(() => DefaultMode, { hasColumnShortcutActions: true }),
      });

      await screen.findByRole("columnheader", { name: "Total" });
      expect(
        screen.getByRole("button", { name: "Add column" }),
      ).toBeInTheDocument();
    });
  });

  describe("with no results", () => {
    it("should render the no-results action", () => {
      setup({
        result: createMockDataset(),
        noResultsAction: <p>Alert prompt</p>,
      });

      expect(screen.getByText("No results")).toBeInTheDocument();
      expect(screen.getByText("Alert prompt")).toBeInTheDocument();
    });

    it("should not render an alert link without a no-results action", () => {
      setup({ result: createMockDataset() });

      expect(screen.getByText("No results")).toBeInTheDocument();
      expect(screen.queryByText(/get an alert/)).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Back to previous results" }),
      ).toBeInTheDocument();
    });
  });
});
