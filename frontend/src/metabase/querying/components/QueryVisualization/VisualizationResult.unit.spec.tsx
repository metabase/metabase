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

import { getDefaultClickActionMode } from "../../click-actions/lib/modes";

import { VisualizationResult } from "./VisualizationResult";
import type { QueryVisualizationProps } from "./types";

registerVisualizations();

// Chart components are loaded on demand. Register them up front so each test
// renders in one pass and can be run on its own.
beforeAll(() => {
  mockGetBoundingClientRect();
  return loadVisualizationComponents(["table"]);
});

// The css-module stub exports {}, so variant classes are invisible to assertions.
// Every css import resolves to that one stub, so this factory replaces it for all of them.
jest.mock(
  "metabase/data-grid/components/HeaderCell/HeaderCell.module.css",
  () => ({
    outline: "outline-header-variant",
  }),
);

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
      // The click-actions popover only renders when a card-run handler exists.
      navigateToNewCardInsideQB={jest.fn()}
      {...props}
    />,
  );
};

describe("VisualizationResult", () => {
  describe("without a mode prop", () => {
    it("keeps column reordering disabled and the outline header", async () => {
      setup();

      const header = await screen.findByRole("columnheader", { name: "Total" });
      // dnd-kit gives headers that accept dragging a button role
      expect(within(header).queryByRole("button")).not.toBeInTheDocument();
      expect(within(header).getByTestId("header-cell")).toHaveClass(
        "outline-header-variant",
      );
    });

    it("still resolves the stock drills on a cell click", async () => {
      setup();

      const cells = await screen.findAllByRole("gridcell");
      await userEvent.click(cells[cells.length - 1]);

      expect(
        await screen.findByTestId("click-actions-view"),
      ).toBeInTheDocument();
    });
  });

  describe("with an explicit mode", () => {
    it("enables column reordering and the light header", async () => {
      setup({ mode: getDefaultClickActionMode });

      const header = await screen.findByRole("columnheader", { name: "Total" });
      expect(within(header).getByRole("button")).toHaveAttribute(
        "aria-roledescription",
        "sortable",
      );
      expect(within(header).getByTestId("header-cell")).not.toHaveClass(
        "outline-header-variant",
      );
    });
  });
});
