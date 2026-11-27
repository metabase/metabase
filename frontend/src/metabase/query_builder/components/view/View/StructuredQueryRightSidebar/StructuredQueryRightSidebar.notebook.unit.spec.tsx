import userEvent from "@testing-library/user-event";
import { useState } from "react";

import {
  setupDatabaseEndpoints,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  within,
} from "__support__/ui";
import { Notebook } from "metabase/querying/notebook/components/Notebook";
import * as Lib from "metabase-lib";
import {
  DEFAULT_TEST_QUERY,
  SAMPLE_METADATA,
  SAMPLE_PROVIDER,
} from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import type { TestQuerySpec } from "metabase-types/api";
import { createMockUnsavedCard } from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { StructuredQueryRightSidebar } from "./StructuredQueryRightSidebar";

type View = "notebook" | "summary";

interface QuestionViewProps {
  view: View;
}

interface SetupOpts {
  querySpec?: TestQuerySpec;
  view: View;
}

const ORDERS_BY_MONTH_STAGE: TestQuerySpec["stages"][number] = {
  source: { type: "table", id: ORDERS_ID },
  aggregations: [{ type: "operator", operator: "count" }],
  breakouts: [{ type: "column", name: "CREATED_AT", unit: "month" }],
};

const setup = ({ querySpec = DEFAULT_TEST_QUERY, view }: SetupOpts) => {
  setupDatabaseEndpoints(createSampleDatabase());
  setupUserMetabotPermissionsEndpoint();
  mockGetBoundingClientRect();
  const initialQuestion = new Question(
    createMockUnsavedCard({
      dataset_query: Lib.createTestJsQuery(SAMPLE_PROVIDER, querySpec),
    }),
    SAMPLE_METADATA,
  );

  const QuestionView = ({ view }: QuestionViewProps) => {
    const [question, setQuestion] = useState(initialQuestion);
    return view === "notebook" ? (
      <Notebook
        question={question}
        isDirty
        isRunnable
        isResultDirty
        reportTimezone="UTC"
        hasVisualizeButton={false}
        updateQuestion={async (nextQuestion) => setQuestion(nextQuestion)}
      />
    ) : (
      <StructuredQueryRightSidebar
        question={question}
        isShowingSummarySidebar
        isShowingTimelineSidebar={false}
        isShowingQuestionInfoSidebar={false}
        isShowingQuestionSettingsSidebar={false}
        updateQuestion={setQuestion}
        onSave={jest.fn()}
      />
    );
  };

  const { rerender } = renderWithProviders(<QuestionView view={view} />);

  return {
    openNotebook: () => rerender(<QuestionView view="notebook" />),
    openSummary: () => rerender(<QuestionView view="summary" />),
  };
};

function getChipLabels(wellId: "values" | "columns") {
  return within(screen.getByTestId(`summary-well-${wellId}`))
    .queryAllByTestId("summary-well-item")
    .map((chip) => chip.textContent);
}

function getSummarizeStep(stageIndex = 0) {
  return screen.getByTestId(`step-summarize-${stageIndex}-0`);
}

function getNotebookClauses(
  stepPart: "aggregate-step" | "breakout-step",
  stageIndex = 0,
) {
  return within(within(getSummarizeStep(stageIndex)).getByTestId(stepPart))
    .getAllByTestId("notebook-cell-item")
    .map((cell) => cell.textContent)
    .filter((text) => text !== "");
}

async function pickSummaryOption(
  label: string,
  searchText: string,
  name: string,
) {
  await userEvent.type(screen.getByLabelText(label), searchText);
  const options = await screen.findAllByRole("option");
  const option = options.find((option) => option.textContent === name);
  if (option == null) {
    throw new Error(`No ${name} option`);
  }
  await userEvent.click(option);
}

describe("StructuredQueryRightSidebar and the notebook", () => {
  describe("a summary made in the sidebar", () => {
    it("shows in the notebook with its function, date unit and bins", async () => {
      const { openNotebook } = setup({ view: "summary" });

      await pickSummaryOption("Add a value by name", "subt", "Subtotal");
      await userEvent.click(
        screen.getByRole("button", {
          name: "Change how Sum of Subtotal is calculated",
        }),
      );
      await userEvent.click(
        await screen.findByRole("menuitem", { name: "Average of ..." }),
      );
      await pickSummaryOption(
        "Add a grouping by name",
        "created",
        "Created At",
      );
      await userEvent.click(
        screen.getByRole("button", {
          name: "Change how Created At: Month is grouped",
        }),
      );
      await userEvent.click(
        await screen.findByRole("menuitem", { name: "Year" }),
      );
      await pickSummaryOption("Add a grouping by name", "tot", "Total");
      expect(getChipLabels("values")).toEqual(["Average of Subtotal"]);
      expect(getChipLabels("columns")).toEqual([
        "Created At: Year",
        "Total: Auto binned",
      ]);

      openNotebook();

      expect(getNotebookClauses("aggregate-step")).toEqual([
        "Average of Subtotal",
      ]);
      expect(getNotebookClauses("breakout-step")).toEqual([
        "Created At: Year",
        "Total: Auto binned",
      ]);
    });

    it("leaves the notebook without what the sidebar removed", async () => {
      const { openNotebook } = setup({
        view: "summary",
        querySpec: {
          stages: [
            {
              ...ORDERS_BY_MONTH_STAGE,
              aggregations: [
                { type: "operator", operator: "count" },
                {
                  type: "operator",
                  operator: "sum",
                  args: [{ type: "column", name: "TOTAL" }],
                },
              ],
            },
          ],
        },
      });

      await userEvent.click(
        screen.getByRole("button", { name: "Remove Count" }),
      );
      await userEvent.click(
        screen.getByRole("button", { name: "Remove Created At: Month" }),
      );
      openNotebook();

      expect(getNotebookClauses("aggregate-step")).toEqual(["Sum of Total"]);
      expect(getNotebookClauses("breakout-step")).toEqual([
        "Pick a column to group by",
      ]);
    });

    it("leaves the notebook without a Summarize step once everything is cleared", async () => {
      const { openNotebook } = setup({
        view: "summary",
        querySpec: { stages: [ORDERS_BY_MONTH_STAGE] },
      });

      await userEvent.click(screen.getByRole("button", { name: "Clear all" }));
      openNotebook();

      expect(
        screen.queryByTestId("step-summarize-0-0"),
      ).not.toBeInTheDocument();
      expect(screen.getByTestId("step-data-0-0")).toBeInTheDocument();
    });

    it("lands in the notebook stage the sidebar edits when the query has two summaries", async () => {
      const { openNotebook } = setup({
        view: "summary",
        querySpec: {
          stages: [
            ORDERS_BY_MONTH_STAGE,
            {
              aggregations: [
                {
                  type: "operator",
                  operator: "avg",
                  args: [{ type: "column", name: "count" }],
                },
              ],
            },
          ],
        },
      });

      await pickSummaryOption(
        "Add a grouping by name",
        "created",
        "Created At: Month",
      );
      openNotebook();

      expect(getNotebookClauses("aggregate-step", 0)).toEqual(["Count"]);
      expect(getNotebookClauses("breakout-step", 0)).toEqual([
        "Created At: Month",
      ]);
      expect(getNotebookClauses("aggregate-step", 1)).toEqual([
        "Average of Count",
      ]);
      expect(getNotebookClauses("breakout-step", 1)).toEqual([
        "Created At: Month",
      ]);
    });
  });

  describe("a summary made in the notebook", () => {
    it("shows in the sidebar as chips", async () => {
      const { openSummary } = setup({ view: "notebook" });

      await userEvent.click(screen.getByRole("button", { name: "Summarize" }));
      await userEvent.click(await screen.findByText("Average of ..."));
      await userEvent.click(await screen.findByText("Quantity"));
      await userEvent.click(screen.getByText("Pick a column to group by"));
      await userEvent.click(await screen.findByText("Created At"));
      expect(getNotebookClauses("aggregate-step")).toEqual([
        "Average of Quantity",
      ]);
      expect(getNotebookClauses("breakout-step")).toEqual([
        "Created At: Month",
      ]);

      openSummary();

      expect(getChipLabels("values")).toEqual(["Average of Quantity"]);
      expect(getChipLabels("columns")).toEqual(["Created At: Month"]);
    });

    it("shows the sidebar what the notebook changed and removed", async () => {
      const { openSummary } = setup({
        view: "notebook",
        querySpec: {
          stages: [
            {
              ...ORDERS_BY_MONTH_STAGE,
              aggregations: [
                { type: "operator", operator: "count" },
                {
                  type: "operator",
                  operator: "sum",
                  args: [{ type: "column", name: "TOTAL" }],
                },
              ],
            },
          ],
        },
      });

      await userEvent.click(
        within(getSummarizeStep()).getByText("Sum of Total"),
      );
      await userEvent.click(await screen.findByText("Tax"));
      await userEvent.click(
        within(within(getSummarizeStep()).getByText("Count")).getByLabelText(
          "close icon",
        ),
      );
      expect(getNotebookClauses("aggregate-step")).toEqual(["Sum of Tax"]);

      openSummary();

      expect(getChipLabels("values")).toEqual(["Sum of Tax"]);
      expect(getChipLabels("columns")).toEqual(["Created At: Month"]);
    });

    it("leaves the sidebar empty once the Summarize step is removed", async () => {
      const { openSummary } = setup({
        view: "notebook",
        querySpec: { stages: [ORDERS_BY_MONTH_STAGE] },
      });

      await userEvent.click(
        within(getSummarizeStep()).getByLabelText("Remove step"),
      );
      openSummary();

      expect(getChipLabels("values")).toEqual([]);
      expect(getChipLabels("columns")).toEqual([]);
    });
  });
});
