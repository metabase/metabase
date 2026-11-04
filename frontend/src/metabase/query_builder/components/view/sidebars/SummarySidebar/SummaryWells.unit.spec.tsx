import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, within } from "__support__/ui";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type { TestQuerySpec } from "metabase-types/api";
import { ORDERS, ORDERS_ID } from "metabase-types/api/mocks/presets";

import { SummaryWells } from "./SummaryWells";
import type { SummaryWellId } from "./types";
import { getDimensionItems, getFieldSections, getValueItems } from "./utils";

const STAGE_INDEX = -1;

const SUMMARIZED_QUERY: TestQuerySpec = {
  stages: [
    {
      source: { type: "table", id: ORDERS_ID },
      aggregations: [
        { type: "operator", operator: "count" },
        {
          type: "operator",
          operator: "sum",
          args: [{ type: "column", name: "TOTAL" }],
        },
      ],
      breakouts: [{ type: "column", name: "CREATED_AT", unit: "month" }],
    },
  ],
};

type SetupOpts = {
  spec?: TestQuerySpec;
  isStartingCountHeld?: boolean;
};

function setup({
  spec = SUMMARIZED_QUERY,
  isStartingCountHeld = false,
}: SetupOpts = {}) {
  const query = Lib.createTestQuery(SAMPLE_PROVIDER, spec);
  const onChange = jest.fn<void, [Lib.Query, SummaryWellId]>();
  renderWithProviders(
    <SummaryWells
      query={query}
      stageIndex={STAGE_INDEX}
      sections={getFieldSections(query, STAGE_INDEX)}
      isStartingCountHeld={isStartingCountHeld}
      onChange={onChange}
    />,
  );

  function getLastChange() {
    const [lastCall] = onChange.mock.calls.slice(-1);
    const [nextQuery, wellId] = lastCall;
    return {
      wellId,
      values: getValueItems(nextQuery, STAGE_INDEX).map(({ label }) => label),
      dimensions: getDimensionItems(nextQuery, STAGE_INDEX).map(
        ({ label }) => label,
      ),
    };
  }

  return { onChange, getLastChange };
}

function getChipLabels(wellId: SummaryWellId) {
  return within(screen.getByTestId(`summary-well-${wellId}`))
    .queryAllByTestId("summary-well-item")
    .map((chip) => chip.textContent);
}

// the bold match splits an option's accessible name, so options are found by their text
async function findOption(name: string) {
  const options = await screen.findAllByRole("option");
  const option = options.find((option) => option.textContent === name);
  if (option == null) {
    throw new Error(`No option named ${name}`);
  }
  return option;
}

const getValuesField = () => screen.getByLabelText("Add a value by name");
const getGroupingField = () => screen.getByLabelText("Add a grouping by name");

describe("SummaryWells", () => {
  it("shows the stage's aggregations and breakouts as chips", () => {
    setup();

    expect(getChipLabels("values")).toEqual(["Count", "Sum of Total"]);
    expect(getChipLabels("columns")).toEqual(["Created At: Month"]);
  });

  it("opens ready to type into Summarize by", () => {
    setup();

    expect(getValuesField()).toHaveFocus();
  });

  it("takes a chip off from its remove button", async () => {
    const { onChange, getLastChange } = setup();

    await userEvent.click(
      screen.getByRole("button", { name: "Remove Sum of Total" }),
    );

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(getLastChange()).toEqual({
      wellId: "values",
      values: ["Count"],
      dimensions: ["Created At: Month"],
    });
  });

  it("switches how a column value is aggregated from its menu", async () => {
    const { getLastChange } = setup();

    await userEvent.click(
      screen.getByRole("button", {
        name: "Change how Sum of Total is calculated",
      }),
    );
    expect(
      await screen.findByRole("menuitem", { name: "Sum of ..." }),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Average of ..." }),
    );

    expect(getLastChange().values).toEqual(["Count", "Average of Total"]);
  });

  it("adds a grouping from the Group by typeahead", async () => {
    const { getLastChange } = setup();

    await userEvent.type(getGroupingField(), "categ");
    await userEvent.click(await findOption("Category"));

    expect(getLastChange()).toEqual({
      wellId: "columns",
      values: ["Count", "Sum of Total"],
      dimensions: ["Created At: Month", "Product → Category"],
    });
    expect(getGroupingField()).toHaveValue("");
  });

  it("adds Count of rows from the Summarize by typeahead with Enter", async () => {
    const { getLastChange } = setup({ spec: DEFAULT_TEST_QUERY });

    await userEvent.type(getValuesField(), "count");
    await findOption("Count of rows");
    await userEvent.keyboard("{Enter}");

    expect(getLastChange()).toEqual({
      wellId: "values",
      values: ["Count"],
      dimensions: [],
    });
  });

  it("doesn't change anything when a value that's already there is picked again", async () => {
    const { onChange } = setup();

    await userEvent.type(getValuesField(), "count");
    await userEvent.click(await findOption("Count of rows"));

    expect(onChange).not.toHaveBeenCalled();
  });

  it("applies the held starting count when Count of rows is picked", async () => {
    const { onChange, getLastChange } = setup({
      spec: {
        stages: [
          {
            source: { type: "table", id: ORDERS_ID },
            aggregations: [{ type: "operator", operator: "count" }],
          },
        ],
      },
      isStartingCountHeld: true,
    });

    await userEvent.type(getValuesField(), "count");
    await userEvent.click(await findOption("Count of rows"));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(getLastChange()).toEqual({
      wellId: "values",
      values: ["Count"],
      dimensions: [],
    });
  });

  it("aggregates a column picked in the Summarize by typeahead with its default operator", async () => {
    const { getLastChange } = setup();

    await userEvent.type(getValuesField(), "quant");
    await userEvent.click(await findOption("Quantity"));

    expect(getLastChange()).toEqual({
      wellId: "values",
      values: ["Count", "Sum of Total", "Sum of Quantity"],
      dimensions: ["Created At: Month"],
    });
  });

  it("says when nothing matches in a typeahead", async () => {
    setup();

    await userEvent.type(getValuesField(), "zzz");

    expect(
      await screen.findByText("No matching metrics or columns"),
    ).toBeInTheDocument();
  });

  it("takes off the last chip on Backspace in an empty field", async () => {
    const { getLastChange } = setup();

    await userEvent.click(getValuesField());
    await userEvent.keyboard("{Backspace}");

    expect(getLastChange()).toEqual({
      wellId: "values",
      values: ["Count"],
      dimensions: ["Created At: Month"],
    });
  });

  it("leaves Backspace alone in an empty well", async () => {
    const { onChange } = setup({ spec: DEFAULT_TEST_QUERY });

    await userEvent.click(getGroupingField());
    await userEvent.keyboard("{Backspace}");

    expect(onChange).not.toHaveBeenCalled();
  });

  it("offers the join path's columns under the joined table's name", async () => {
    setup({
      spec: {
        stages: [
          {
            source: { type: "table", id: ORDERS_ID },
            aggregations: [{ type: "operator", operator: "count" }],
            breakouts: [
              {
                type: "column",
                sourceFieldId: ORDERS.PRODUCT_ID,
                name: "CATEGORY",
              },
            ],
          },
        ],
      },
    });

    expect(getChipLabels("columns")).toEqual(["Product → Category"]);
  });
});
