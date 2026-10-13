import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCardDataset,
  setupDatabaseEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
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

import { DatasetExplorer } from "./DatasetExplorer";

registerVisualizations();

interface SetupOpts {
  query?: StructuredQuery;
}

function setup({ query = {} }: SetupOpts = {}) {
  setupDatabaseEndpoints(createSampleDatabase());
  setupCardDataset({
    dataset: createMockDataset({
      data: createMockDatasetData({ rows: [[200]] }),
    }),
  });
  const question = new Question(
    createMockCard({
      dataset_query: {
        type: "query",
        database: SAMPLE_DB_ID,
        query: { "source-table": PRODUCTS_ID, ...query },
      },
    }),
    SAMPLE_METADATA,
  ).setDisplay("table");
  const onChange = jest.fn<void, [Question]>();
  renderWithProviders(
    <DatasetExplorer
      initialQuestion={question}
      returnTo="/question#abc"
      onChange={onChange}
    />,
    { withRouter: true },
  );
  return { onChange };
}

function getLastQuery(onChange: jest.Mock<void, [Question]>) {
  const question = onChange.mock.calls.at(-1)?.[0];
  if (!question) {
    throw new Error("Expected the explorer to update the question");
  }
  return Lib.toLegacyQuery(question.query());
}

// Unit tests render CodeMirror as a textarea, so typed formulas run via Run.
async function runFormula(formula: string) {
  const editor = screen.getByTestId("table-formula-editor");
  await userEvent.clear(editor);
  await userEvent.type(editor, formula);
  await userEvent.click(screen.getByRole("button", { name: "Run" }));
}

describe("DatasetExplorer", () => {
  it("starts with Sum of Price and accepts a typed formula, keeping filters", async () => {
    const { onChange } = setup({
      query: {
        filter: [">", ["field", PRODUCTS.PRICE, null], 10],
        breakout: [["field", PRODUCTS.CATEGORY, null]],
      },
    });
    expect(await screen.findByDisplayValue("Sum([Price])")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to table" })).toHaveAttribute(
      "href",
      "/question#abc",
    );
    await runFormula("AVG(price)");
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(getLastQuery(onChange)).toMatchObject({
      query: {
        aggregation: [["avg", ["field", PRODUCTS.PRICE, expect.anything()]]],
        filter: [">", ["field", PRODUCTS.PRICE, expect.anything()], 10],
        breakout: [["field", PRODUCTS.CATEGORY, expect.anything()]],
      },
    });
    expect(
      fetchMock.callHistory.calls("path:/api/metric/dataset"),
    ).toHaveLength(0);
  });

  it("shows invalid formula errors without replacing the current calculation", async () => {
    const { onChange } = setup();
    await screen.findByDisplayValue("Sum([Price])");
    await runFormula("SUM(nope)");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unknown column: nope",
    );
    expect(onChange).not.toHaveBeenCalled();
    await runFormula("COUNT()");
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("appends a block with an operator from the add menu", async () => {
    const { onChange } = setup();
    await screen.findByDisplayValue("Sum([Price])");

    await userEvent.click(
      screen.getByRole("button", { name: "Add to formula" }),
    );
    await userEvent.hover(
      await screen.findByRole("menuitem", { name: /Divide by/ }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Count" }),
    );
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(getLastQuery(onChange)).toMatchObject({
      query: {
        aggregation: [
          [
            "/",
            ["sum", ["field", PRODUCTS.PRICE, expect.anything()]],
            ["count"],
          ],
        ],
      },
    });
  });

  it("groups and changes the chart from the bottom controls", async () => {
    const { onChange } = setup();
    await screen.findByDisplayValue("Sum([Price])");
    await userEvent.click(screen.getByRole("button", { name: /Group by/ }));
    await userEvent.click(
      within(screen.getByRole("listitem", { name: "Category" })).getByRole(
        "button",
        { name: "Add dimension" },
      ),
    );
    expect(getLastQuery(onChange)).toMatchObject({
      query: { breakout: [["field", PRODUCTS.CATEGORY, expect.anything()]] },
    });
    await userEvent.click(screen.getByRole("button", { name: "Bar" }));
    expect(onChange.mock.calls.at(-1)?.[0].display()).toBe("bar");
  });
});
