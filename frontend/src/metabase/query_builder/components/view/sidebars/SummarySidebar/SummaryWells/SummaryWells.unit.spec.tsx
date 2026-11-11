import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, within } from "__support__/ui";
import { format } from "metabase/querying/expressions";
import { isNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type { TestQuerySpec } from "metabase-types/api";
import { ORDERS, ORDERS_ID } from "metabase-types/api/mocks/presets";

import { makeSummaryFormula } from "../../../../../utils/summary-formulas";
import type { SummaryField, SummaryWellId } from "../types";
import { getDimensionItems, getFieldSections, getValueItems } from "../utils";

import { SummaryWells } from "./SummaryWells";

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

const FORMULA_QUERY: TestQuerySpec = {
  stages: [
    {
      source: { type: "table", id: ORDERS_ID },
      expressions: [
        {
          name: "Order date",
          value: {
            type: "operator",
            operator: "datetime-add",
            args: [
              { type: "column", name: "CREATED_AT" },
              { type: "literal", value: 1 },
              { type: "literal", value: "day" },
            ],
          },
        },
        {
          name: "Existing formula",
          value: { type: "column", name: "Order date" },
        },
      ],
      aggregations: [
        {
          name: "Sum total",
          value: {
            type: "operator",
            operator: "sum",
            args: [{ type: "column", name: "TOTAL" }],
          },
        },
      ],
      breakouts: [{ type: "column", name: "Order date", unit: "month" }],
      orderBys: [{ type: "column", name: "Order date", unit: "month" }],
      filters: [
        {
          type: "operator",
          operator: ">",
          args: [
            { type: "column", name: "Order date" },
            { type: "literal", value: "2024-01-01" },
          ],
        },
      ],
    },
  ],
};

type SetupOpts = {
  spec?: TestQuerySpec;
  formulaNames?: string[];
};

function setup({ spec = SUMMARIZED_QUERY, formulaNames = [] }: SetupOpts = {}) {
  const query = Lib.createTestQuery(SAMPLE_PROVIDER, spec);
  const generatedExpressions = formulaNames
    .map((name) => makeSummaryFormula(query, STAGE_INDEX, name))
    .filter(isNotNull);
  const onPick = jest.fn<void, [SummaryWellId, SummaryField]>();
  const onChange = jest.fn<void, [Lib.Query]>();
  renderWithProviders(
    <SummaryWells
      query={query}
      stageIndex={STAGE_INDEX}
      sections={getFieldSections(query, STAGE_INDEX)}
      generatedExpressions={generatedExpressions}
      draggedItem={null}
      onPick={onPick}
      onChange={onChange}
    />,
  );

  function getLastChange() {
    const [lastCall] = onChange.mock.calls.slice(-1);
    const [nextQuery] = lastCall;
    return {
      values: getValueItems(nextQuery, STAGE_INDEX).map(({ label }) => label),
      dimensions: getDimensionItems(nextQuery, STAGE_INDEX).map(
        ({ label }) => label,
      ),
    };
  }

  return { onPick, onChange, getLastChange };
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
  it.each(["Order date", "Sum total"])(
    "renames %s and its result column without changing the formula",
    async (name) => {
      const { onChange } = setup({
        spec: FORMULA_QUERY,
        formulaNames: ["Order date"],
      });

      await userEvent.dblClick(
        screen.getByRole("button", {
          name:
            name === "Order date"
              ? "Rename Order date: Month"
              : `Rename ${name}`,
        }),
      );
      const input = screen.getByRole("textbox", { name: `Name of ${name}` });
      expect(input).toHaveFocus();
      expect(input).toHaveValue(name);
      await userEvent.keyboard("  Renamed formula  {Enter}");

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(
        name === "Order date" ? getGroupingField() : getValuesField(),
      ).toHaveFocus();
      const [query] = onChange.mock.calls[0];
      const resultNames = Lib.returnedColumns(query, STAGE_INDEX).map(
        (column) => Lib.displayInfo(query, STAGE_INDEX, column).displayName,
      );
      expect(resultNames).toContain(
        name === "Order date" ? "Renamed formula: Month" : "Renamed formula",
      );
      expect(resultNames).not.toContain(name);
      const options = {
        query,
        stageIndex: STAGE_INDEX,
        availableColumns: Lib.expressionableColumns(query, STAGE_INDEX),
      };
      const [expression] = Lib.expressions(query, STAGE_INDEX);
      const [aggregation] = Lib.aggregations(query, STAGE_INDEX);
      const [filter] = Lib.filters(query, STAGE_INDEX);
      expect(await format(expression, options)).toBe(
        'datetimeAdd([Created At], 1, "day")',
      );
      expect(await format(aggregation, options)).toBe("Sum([Total])");
      const dimensionName =
        name === "Order date" ? "Renamed formula" : "Order date";
      expect(await format(filter, options)).toBe(
        `[${dimensionName}] > "2024-01-01"`,
      );
      const [breakout] = Lib.breakouts(query, STAGE_INDEX);
      expect(Lib.temporalBucket(breakout)).not.toBeNull();
      expect(Lib.toLegacyQuery(query)).toMatchObject({
        query: {
          "order-by": [
            [
              "asc",
              ["expression", dimensionName, { "temporal-unit": "month" }],
            ],
          ],
        },
      });
    },
  );

  it("cancels renaming with Escape and commits a nonempty name on blur", async () => {
    const { onChange, getLastChange } = setup({
      spec: FORMULA_QUERY,
      formulaNames: ["Order date"],
    });
    await userEvent.dblClick(
      screen.getByRole("button", { name: "Rename Order date: Month" }),
    );
    await userEvent.keyboard("Discard this name{Escape}");
    expect(onChange).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("textbox", { name: "Name of Order date" }),
    ).not.toBeInTheDocument();

    await userEvent.dblClick(
      screen.getByRole("button", { name: "Rename Order date: Month" }),
    );
    await userEvent.keyboard("{Backspace}");
    await userEvent.click(getGroupingField());
    expect(onChange).not.toHaveBeenCalled();

    await userEvent.dblClick(
      screen.getByRole("button", { name: "Rename Order date: Month" }),
    );
    await userEvent.keyboard("Existing formula");
    await userEvent.click(getGroupingField());
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(getLastChange().dimensions).toEqual(["Existing formula (1): Month"]);
  });

  it("only renames the grouping created through the formula input", async () => {
    const { onChange } = setup({
      formulaNames: ["Order date"],
      spec: {
        stages: [
          {
            ...FORMULA_QUERY.stages[0],
            orderBys: [],
            breakouts: [
              { type: "column", name: "Order date", unit: "month" },
              { type: "column", name: "Order date", unit: "quarter" },
              { type: "column", name: "Existing formula" },
              { type: "column", name: "CREATED_AT", unit: "month" },
            ],
          },
        ],
      },
    });
    for (const label of [
      "Order date: Quarter",
      "Existing formula",
      "Created At: Month",
    ]) {
      await userEvent.dblClick(
        within(screen.getByTestId("summary-well-columns")).getByText(label),
      );
      expect(
        screen.queryByRole("textbox", { name: /^Name of / }),
      ).not.toBeInTheDocument();
    }
    expect(onChange).not.toHaveBeenCalled();
    await userEvent.dblClick(
      screen.getByRole("button", { name: "Rename Order date: Month" }),
    );
    expect(
      screen.getByRole("textbox", { name: "Name of Order date" }),
    ).toHaveFocus();
  });

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

  it("picks a grouping from the Group by typeahead", async () => {
    const { onPick, onChange } = setup();

    await userEvent.type(getGroupingField(), "categ");
    await userEvent.click(await findOption("Category"));

    expect(onPick).toHaveBeenCalledTimes(1);
    const [wellId, field] = onPick.mock.calls[0];
    expect(wellId).toBe("columns");
    expect(field.kind).toBe("column");
    expect(onChange).not.toHaveBeenCalled();
    expect(getGroupingField()).toHaveValue("");
  });

  it("picks Count of rows from the Summarize by typeahead with Enter", async () => {
    const { onPick } = setup({ spec: DEFAULT_TEST_QUERY });

    await userEvent.type(getValuesField(), "count");
    await findOption("Count of rows");
    await userEvent.keyboard("{Enter}");

    expect(onPick).toHaveBeenCalledWith("values", { kind: "count" });
  });

  it("offers the columns to Summarize by as well", async () => {
    const { onPick } = setup();

    await userEvent.type(getValuesField(), "quant");
    await userEvent.click(await findOption("Quantity"));

    expect(onPick).toHaveBeenCalledTimes(1);
    const [wellId, field] = onPick.mock.calls[0];
    expect(wellId).toBe("values");
    expect(field.kind).toBe("column");
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

  it("names a grouping through a join path by that path", () => {
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
