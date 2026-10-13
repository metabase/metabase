import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCardDataset,
  setupDatabaseEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { getSummaryQuestion } from "metabase/common/metrics-viewer/question-summary";
import { registerVisualizations } from "metabase/visualizations/register";
import * as Lib from "metabase-lib";
import { SAMPLE_METADATA } from "metabase-lib/query/test-helpers";
import Question from "metabase-lib/v1/Question";
import type { StructuredQuery } from "metabase-types/api";
import {
  createMockCard,
  createMockDataset,
  createMockDatasetData,
} from "metabase-types/api/mocks";
import {
  PRODUCTS,
  PRODUCTS_ID,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { QuestionSummary } from "./QuestionSummaryPage";

registerVisualizations();

interface SetupOpts {
  query?: StructuredQuery;
  error?: boolean;
}
function setup({ query = {}, error = false }: SetupOpts = {}) {
  setupDatabaseEndpoints(createSampleDatabase());
  setupCardDataset({
    status: error ? 500 : 200,
    dataset: createMockDataset({
      data: createMockDatasetData({ rows: [[200]] }),
    }),
  });
  const source = new Question(
    createMockCard({
      dataset_query: {
        type: "query",
        database: SAMPLE_DB_ID,
        query: { "source-table": PRODUCTS_ID, ...query },
      },
    }),
    SAMPLE_METADATA,
  );
  const question = getSummaryQuestion(source);
  const onChange = jest.fn<void, [Question]>();
  renderWithProviders(
    <QuestionSummary initialQuestion={question} onChange={onChange} />,
    { withRouter: true },
  );
  return { onChange };
}

describe("QuestionSummary", () => {
  it("runs an ad hoc query with numeric filters and custom columns, without requesting measures", async () => {
    setup({
      query: {
        filter: [">", ["field", PRODUCTS.PRICE, null], 10],
        expressions: { Double: ["*", ["field", PRODUCTS.PRICE, null], 2] },
      },
    });
    await waitFor(() =>
      expect(fetchMock.callHistory.calls("path:/api/dataset")).toHaveLength(1),
    );
    const body: unknown = await fetchMock.callHistory
      .calls("path:/api/dataset")[0]
      ?.request?.json();
    expect(body).toMatchObject({
      stages: [
        {
          aggregation: [["count", expect.anything()]],
          filters: [
            [
              ">",
              expect.anything(),
              ["field", expect.anything(), PRODUCTS.PRICE],
              10,
            ],
          ],
          expressions: [
            [
              "*",
              expect.objectContaining({ "lib/expression-name": "Double" }),
              ["field", expect.anything(), PRODUCTS.PRICE],
              2,
            ],
          ],
        },
      ],
    });
    expect(fetchMock.callHistory.calls("path:/api/measure")).toHaveLength(0);
  });

  it("changes Count to Average Price and adds a grouping using the standard controls", async () => {
    const { onChange } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Count" }));
    await userEvent.click(screen.getByText("Average of ..."));
    await userEvent.click(
      within(screen.getByRole("dialog")).getByText("Price", { exact: true }),
    );
    await userEvent.keyboard("{Escape}");
    await userEvent.click(
      within(screen.getByRole("listitem", { name: "Category" })).getByRole(
        "button",
        { name: "Add dimension" },
      ),
    );
    const lastQuestion = onChange.mock.calls.at(-1)?.[0];
    expect(lastQuestion).toBeDefined();
    if (!lastQuestion) {
      throw new Error("Expected the summary controls to update the question");
    }
    {
      expect(Lib.toLegacyQuery(lastQuestion.query())).toMatchObject({
        query: {
          aggregation: [["avg", ["field", PRODUCTS.PRICE, expect.anything()]]],
          breakout: [["field", PRODUCTS.CATEGORY, expect.anything()]],
        },
      });
    }
  });

  it("shows a query failure instead of an empty successful result", async () => {
    setup({ error: true });
    expect(await screen.findByText("An error occurred")).toBeInTheDocument();
  });
});
