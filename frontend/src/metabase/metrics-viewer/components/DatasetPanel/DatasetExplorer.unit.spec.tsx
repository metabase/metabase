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
  barVariant?: "single" | "row";
}

function setup({ query = {}, barVariant = "single" }: SetupOpts = {}) {
  localStorage.setItem("metabase-excel-mode-formula-bar", barVariant);
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
  afterEach(() => {
    localStorage.clear();
  });

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
    const { onChange } = setup({ barVariant: "row" });
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

  it("adds a calculation and removes another one", async () => {
    const { onChange } = setup({ barVariant: "row" });
    await screen.findByDisplayValue("Sum([Price])");
    expect(
      screen.queryByRole("button", { name: "Remove calculation" }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Add calculation" }),
    );
    const editors = screen.getAllByTestId("table-formula-editor");
    expect(editors).toHaveLength(2);
    await userEvent.type(editors[1], "COUNT()");
    await userEvent.click(screen.getByRole("button", { name: "Run" }));

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(getLastQuery(onChange)).toMatchObject({
      query: {
        aggregation: [
          ["sum", ["field", PRODUCTS.PRICE, expect.anything()]],
          ["count"],
        ],
      },
    });
    expect(await screen.findByDisplayValue("Count()")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add calculation" }),
    ).toBeInTheDocument();

    const removeButtons = screen.getAllByRole("button", {
      name: "Remove calculation",
    });
    expect(removeButtons).toHaveLength(2);
    await userEvent.click(removeButtons[0]);
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(getLastQuery(onChange)).toMatchObject({
      query: { aggregation: [["count"]] },
    });
  });

  it("discards an empty draft calculation", async () => {
    const { onChange } = setup({ barVariant: "row" });
    await screen.findByDisplayValue("Sum([Price])");
    await userEvent.click(
      screen.getByRole("button", { name: "Add calculation" }),
    );
    expect(screen.getAllByTestId("table-formula-editor")).toHaveLength(2);

    await userEvent.click(
      screen.getByRole("button", { name: "Remove calculation" }),
    );
    expect(screen.getAllByTestId("table-formula-editor")).toHaveLength(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("edits every calculation in one comma-separated bar", async () => {
    const { onChange } = setup();
    await screen.findByDisplayValue("Sum([Price])");
    expect(
      screen.queryByRole("button", { name: "Add calculation" }),
    ).not.toBeInTheDocument();

    await runFormula("SUM(price), COUNT()");
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(getLastQuery(onChange)).toMatchObject({
      query: {
        aggregation: [
          ["sum", ["field", PRODUCTS.PRICE, expect.anything()]],
          ["count"],
        ],
      },
    });
    expect(
      await screen.findByDisplayValue("Sum([Price]), Count()"),
    ).toBeInTheDocument();
  });

  it("names the calculation that fails in the single bar", async () => {
    const { onChange } = setup();
    await screen.findByDisplayValue("Sum([Price])");
    await runFormula("SUM(price), SUM(nope)");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Calculation 2: Unknown column: nope",
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it("switches between the single bar and a bar per calculation", async () => {
    setup();
    await screen.findByDisplayValue("Sum([Price])");
    await userEvent.click(
      screen.getByRole("radio", { name: "Bar per calculation" }),
    );
    expect(
      screen.getByRole("button", { name: "Add calculation" }),
    ).toBeInTheDocument();
    expect(localStorage.getItem("metabase-excel-mode-formula-bar")).toBe("row");
  });

  it("adds a suggested calculation with one click", async () => {
    const { onChange } = setup();
    await screen.findByDisplayValue("Sum([Price])");
    const suggestions = screen.getByRole("group", {
      name: "Suggested calculations",
    });
    await userEvent.click(
      within(suggestions).getByRole("button", { name: "Average of Price" }),
    );
    expect(getLastQuery(onChange)).toMatchObject({
      query: {
        aggregation: [
          ["sum", ["field", PRODUCTS.PRICE, expect.anything()]],
          ["avg", ["field", PRODUCTS.PRICE, expect.anything()]],
        ],
      },
    });
  });

  it("shows a table skeleton with one-click groupings until there's a grouping", async () => {
    const { onChange } = setup();
    const skeleton = await screen.findByTestId("result-skeleton");
    expect(within(skeleton).getByText("Sum of Price")).toBeInTheDocument();
    await userEvent.click(
      within(skeleton).getByRole("button", { name: "Category" }),
    );
    expect(getLastQuery(onChange)).toMatchObject({
      query: { breakout: [["field", PRODUCTS.CATEGORY, expect.anything()]] },
    });
    expect(screen.queryByTestId("result-skeleton")).not.toBeInTheDocument();
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
