import { EditorView } from "@codemirror/view";
import userEvent from "@testing-library/user-event";

import { createMockMetadata } from "__support__/metadata";
import {
  setupDatabaseEndpoints,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import {
  act,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import * as Lib from "metabase-lib";
import {
  DEFAULT_TEST_QUERY,
  SAMPLE_PROVIDER,
  createMetadataProvider,
} from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import type { Card, TestQuerySpec } from "metabase-types/api";
import {
  createMockCard,
  createMockUnsavedCard,
} from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import type { UpdateQuestionOpts } from "../../../../actions";
import { FormulaBarSlotProvider, FormulaBarSlotTarget } from "../../FormulaBar";

import { StructuredQueryRightSidebar } from "./StructuredQueryRightSidebar";

jest.unmock("@uiw/react-codemirror");

type UpdateQuestion = (question: Question, opts?: UpdateQuestionOpts) => void;

interface SidebarProps {
  isShowingSummarySidebar: boolean;
}

interface SetupOpts {
  querySpec?: TestQuerySpec;
  sourceCards?: Card[];
}

const ORDERS_BY_MONTH_STAGE: TestQuerySpec["stages"][number] = {
  source: { type: "table", id: ORDERS_ID },
  aggregations: [{ type: "operator", operator: "count" }],
  breakouts: [{ type: "column", name: "CREATED_AT", unit: "month" }],
};

const setup = ({
  querySpec = DEFAULT_TEST_QUERY,
  sourceCards = [],
}: SetupOpts = {}) => {
  setupDatabaseEndpoints(createSampleDatabase());
  setupUserMetabotPermissionsEndpoint();
  const metadata = createMockMetadata({
    databases: [createSampleDatabase()],
    questions: sourceCards,
  });
  const question = new Question(
    createMockUnsavedCard({
      dataset_query: Lib.createTestJsQuery(
        createMetadataProvider({ metadata }),
        querySpec,
      ),
    }),
    metadata,
  );
  const updateQuestion = jest.fn<
    ReturnType<UpdateQuestion>,
    Parameters<UpdateQuestion>
  >();

  const Sidebar = ({ isShowingSummarySidebar }: SidebarProps) => (
    <FormulaBarSlotProvider>
      <FormulaBarSlotTarget />
      <StructuredQueryRightSidebar
        question={question}
        isShowingSummarySidebar={isShowingSummarySidebar}
        isShowingTimelineSidebar={false}
        isShowingQuestionInfoSidebar={false}
        isShowingQuestionSettingsSidebar={false}
        updateQuestion={updateQuestion}
        onSave={jest.fn()}
      />
    </FormulaBarSlotProvider>
  );

  const { rerender } = renderWithProviders(
    <Sidebar isShowingSummarySidebar={false} />,
  );

  return {
    updateQuestion,
    openSummary: () => rerender(<Sidebar isShowingSummarySidebar />),
    closeSummary: () => rerender(<Sidebar isShowingSummarySidebar={false} />),
  };
};

function getSectionNames() {
  return screen
    .getAllByTestId("summary-field-section")
    .map((section) => section.getAttribute("aria-label"));
}

function getFieldNames(sectionName: string) {
  return within(screen.getByRole("region", { name: sectionName }))
    .getAllByTestId("summary-field-item")
    .map((item) => item.textContent);
}

function getChipLabels() {
  return screen
    .queryAllByTestId("summary-well-item")
    .map((chip) => chip.textContent);
}

describe("StructuredQueryRightSidebar", () => {
  it("doesn't change the question when Summarize is opened and closed without changes", () => {
    const { updateQuestion, openSummary, closeSummary } = setup();

    openSummary();
    expect(screen.getByTestId("summary-sidebar")).toBeInTheDocument();
    expect(screen.queryByTestId("summary-well-item")).not.toBeInTheDocument();

    closeSummary();
    expect(screen.queryByTestId("summary-sidebar")).not.toBeInTheDocument();

    expect(updateQuestion).not.toHaveBeenCalled();
  });

  it("updates and reruns the question once a field is picked", async () => {
    const { updateQuestion, openSummary } = setup();

    openSummary();
    await userEvent.click(
      within(screen.getByRole("region", { name: "Product" })).getByRole(
        "button",
        { name: "Category" },
      ),
    );

    expect(updateQuestion).toHaveBeenCalledTimes(1);
    const [[nextQuestion, options]] = updateQuestion.mock.calls;
    expect(Lib.breakouts(nextQuestion.query(), -1)).toHaveLength(1);
    expect(Lib.aggregations(nextQuestion.query(), -1)).toHaveLength(1);
    expect(options).toEqual({ run: true });
  });

  it.each([
    { formula: "[Total] + 2", columnChange: "in-place" },
    { formula: "now()", columnChange: "regrouped" },
  ])(
    "updates the question with $columnChange columns after a grouping formula changes to $formula",
    async ({ formula, columnChange }) => {
      const { updateQuestion, openSummary } = setup({
        querySpec: {
          stages: [
            {
              ...ORDERS_BY_MONTH_STAGE,
              expressions: [
                {
                  name: "Total + 1",
                  value: {
                    type: "operator",
                    operator: "+",
                    args: [
                      { type: "column", name: "TOTAL" },
                      { type: "literal", value: 1 },
                    ],
                  },
                },
              ],
              breakouts: [{ type: "column", name: "Total + 1" }],
            },
          ],
        },
      });
      openSummary();
      await userEvent.click(
        await screen.findByRole("button", {
          name: "Edit the formula of Total + 1",
        }),
      );
      const editor = await screen.findByTestId("formula-editor");
      const view = await waitFor(() => {
        const view = EditorView.findFromDOM(editor);
        expect(view?.state.doc.toString()).toBe("[Total] + 1");
        return view;
      });
      if (view) {
        act(() =>
          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: formula },
            userEvent: "input.type",
          }),
        );
      }
      await userEvent.click(screen.getByRole("button", { name: "Update" }));

      expect(updateQuestion).toHaveBeenCalledWith(expect.any(Question), {
        run: true,
        columnChange,
      });
    },
  );

  describe("field list by source", () => {
    it("lists a model's columns and the tables it links to for a question built on a model", () => {
      const model = createMockCard({
        id: 1,
        name: "Orders Model",
        type: "model",
        dataset_query: Lib.createTestJsQuery(
          SAMPLE_PROVIDER,
          DEFAULT_TEST_QUERY,
        ),
      });
      const { openSummary } = setup({
        sourceCards: [model],
        querySpec: { stages: [{ source: { type: "card", id: model.id } }] },
      });

      openSummary();

      expect(getSectionNames()).toEqual(["Orders Model", "Product", "User"]);
      expect(getFieldNames("Orders Model")).toContain("Total");
    });

    it("lists only what a saved question returns for a question built on it", () => {
      const savedQuestion = createMockCard({
        id: 1,
        name: "Monthly Orders",
        type: "question",
        dataset_query: Lib.createTestJsQuery(SAMPLE_PROVIDER, {
          stages: [ORDERS_BY_MONTH_STAGE],
        }),
      });
      const { openSummary } = setup({
        sourceCards: [savedQuestion],
        querySpec: {
          stages: [{ source: { type: "card", id: savedQuestion.id } }],
        },
      });

      openSummary();

      expect(getSectionNames()).toEqual(["Monthly Orders"]);
      expect(getFieldNames("Monthly Orders")).toEqual([
        "Created At: Month",
        "Count",
      ]);
    });

    it("shows the summary and its table's columns when a later stage only adds a column", () => {
      const { openSummary } = setup({
        querySpec: {
          stages: [
            ORDERS_BY_MONTH_STAGE,
            {
              expressions: [
                {
                  name: "Double",
                  value: {
                    type: "operator",
                    operator: "*",
                    args: [
                      { type: "column", name: "count" },
                      { type: "literal", value: 2 },
                    ],
                  },
                },
              ],
            },
          ],
        },
      });

      openSummary();

      expect(getChipLabels()).toEqual(["Count", "Created At: Month"]);
      expect(getSectionNames()).toEqual(["Orders", "Product", "User"]);
    });

    it("shows the last summary and the previous stage's results when a later stage is summarized too", () => {
      const { openSummary } = setup({
        querySpec: {
          stages: [
            ORDERS_BY_MONTH_STAGE,
            { aggregations: [{ type: "operator", operator: "count" }] },
          ],
        },
      });

      openSummary();

      expect(getChipLabels()).toEqual(["Count"]);
      expect(getSectionNames()).toEqual(["Summaries"]);
      expect(getFieldNames("Summaries")).toEqual([
        "Created At: Month",
        "Count",
      ]);
    });
  });
});
