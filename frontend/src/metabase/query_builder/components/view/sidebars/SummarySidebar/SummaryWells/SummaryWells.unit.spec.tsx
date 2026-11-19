import userEvent from "@testing-library/user-event";

import {
  fireEvent,
  mockTextOverflow,
  renderWithProviders,
  screen,
  within,
} from "__support__/ui";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type { TestQuerySpec } from "metabase-types/api";
import { ORDERS, ORDERS_ID } from "metabase-types/api/mocks/presets";

import type {
  SummaryField,
  SummaryQueryChangeOptions,
  SummaryWellId,
} from "../types";
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

type SetupOpts = {
  spec?: TestQuerySpec;
};

function setup({ spec = SUMMARIZED_QUERY }: SetupOpts = {}) {
  const query = Lib.createTestQuery(SAMPLE_PROVIDER, spec);
  const onPick = jest.fn<void, [SummaryWellId, SummaryField]>();
  const onChange = jest.fn<void, [Lib.Query, SummaryQueryChangeOptions?]>();
  renderWithProviders(
    <SummaryWells
      query={query}
      stageIndex={STAGE_INDEX}
      sections={getFieldSections(query, STAGE_INDEX)}
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
  it("shows the stage's aggregations and breakouts as chips", () => {
    setup();

    expect(getChipLabels("values")).toEqual(["Count", "Sum of Total"]);
    expect(getChipLabels("columns")).toEqual(["Created At: Month"]);
  });

  it("opens ready to type into Summarize by", () => {
    setup();

    expect(getValuesField()).toHaveFocus();
  });

  it("shows the full formula in the tooltip without changing its shortened name", async () => {
    const name = "Sum(Total) + 100 + 100 + 100 + 100 +…";
    setup({
      spec: {
        stages: [
          {
            source: { type: "table", id: ORDERS_ID },
            aggregations: [
              {
                name,
                value: {
                  type: "operator",
                  operator: "+",
                  args: [
                    {
                      type: "operator",
                      operator: "sum",
                      args: [{ type: "column", name: "TOTAL" }],
                    },
                    ...Array.from({ length: 6 }, () => ({
                      type: "literal" as const,
                      value: 100,
                    })),
                  ],
                },
              },
            ],
          },
        ],
      },
    });

    await userEvent.hover(screen.getByText(name));
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Sum([Total]) + 100 + 100 + 100 + 100 + 100 + 100",
    );
    expect(getChipLabels("values")).toEqual([name]);
  });

  it("shows full grouping formulas in tooltips and keeps their bucket menus", async () => {
    const name = "Total + 100 + 100 + 100 + 100 +…";
    const dateName = "coalesce(Created At, Created At)";
    const { getLastChange } = setup({
      spec: {
        stages: [
          {
            source: { type: "table", id: ORDERS_ID },
            aggregations: [{ type: "operator", operator: "count" }],
            expressions: [
              {
                name,
                value: {
                  type: "operator",
                  operator: "+",
                  args: [
                    { type: "column", name: "TOTAL" },
                    ...Array.from({ length: 6 }, () => ({
                      type: "literal" as const,
                      value: 100,
                    })),
                  ],
                },
              },
              {
                name: dateName,
                value: {
                  type: "operator",
                  operator: "coalesce",
                  args: [
                    { type: "column", name: "CREATED_AT" },
                    { type: "column", name: "CREATED_AT" },
                  ],
                },
              },
            ],
            breakouts: [
              { type: "column", name },
              { type: "column", name: dateName, unit: "month" },
            ],
          },
        ],
      },
    });

    const groupBy = within(screen.getByTestId("summary-well-columns"));
    await userEvent.hover(groupBy.getByText(name));
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "[Total] + 100 + 100 + 100 + 100 + 100 + 100",
    );
    await userEvent.unhover(groupBy.getByText(name));
    await userEvent.hover(groupBy.getByText(`${dateName}:`));
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "coalesce([Created At], [Created At])",
    );
    expect(getChipLabels("columns")).toEqual([name, `${dateName}: Month`]);

    await userEvent.click(
      screen.getByRole("button", {
        name: `Change how ${dateName}: Month is grouped`,
      }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Year" }),
    );
    expect(getLastChange().dimensions).toEqual([name, `${dateName}: Year`]);
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

  describe("grouping buckets", () => {
    const openBucketMenu = (label: string) =>
      userEvent.click(
        screen.getByRole("button", { name: `Change how ${label} is grouped` }),
      );

    it("switches a date grouping's unit from its menu", async () => {
      const { onChange, getLastChange } = setup();

      await openBucketMenu("Created At: Month");
      expect(
        await screen.findByRole("menuitem", { name: "Month" }),
      ).toBeInTheDocument();
      await userEvent.click(screen.getByRole("menuitem", { name: "Year" }));

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(getLastChange().dimensions).toEqual(["Created At: Year"]);
    });

    it("keeps the less common units behind More", async () => {
      const { getLastChange } = setup();

      await openBucketMenu("Created At: Month");
      await screen.findByRole("menuitem", { name: "Month" });
      expect(
        screen.queryByRole("menuitem", { name: "Don't bin" }),
      ).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole("menuitem", { name: "More…" }));
      expect(
        screen.getByRole("menuitem", { name: "Day of week" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("menuitem", { name: "More…" }),
      ).not.toBeInTheDocument();
      await userEvent.click(
        screen.getByRole("menuitem", { name: "Don't bin" }),
      );

      expect(getLastChange().dimensions).toEqual(["Created At"]);
    });

    it("opens with every unit when the one in use is a less common one", async () => {
      setup({
        spec: {
          stages: [
            {
              source: { type: "table", id: ORDERS_ID },
              aggregations: [{ type: "operator", operator: "count" }],
              breakouts: [
                { type: "column", name: "CREATED_AT", unit: "day-of-week" },
              ],
            },
          ],
        },
      });

      await openBucketMenu("Created At: Day of week");

      expect(
        await screen.findByRole("menuitem", { name: "Day of week" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("menuitem", { name: "More…" }),
      ).not.toBeInTheDocument();
    });

    it("doesn't rerun when the unit in use is picked again", async () => {
      const { onChange } = setup();

      await openBucketMenu("Created At: Month");
      await userEvent.click(
        await screen.findByRole("menuitem", { name: "Month" }),
      );

      expect(onChange).not.toHaveBeenCalled();
    });

    it("doesn't rerun when another grouping of the column already has the unit", async () => {
      const { onChange } = setup({
        spec: {
          stages: [
            {
              source: { type: "table", id: ORDERS_ID },
              aggregations: [{ type: "operator", operator: "count" }],
              breakouts: [
                { type: "column", name: "CREATED_AT", unit: "year" },
                { type: "column", name: "CREATED_AT", unit: "month" },
              ],
            },
          ],
        },
      });

      await openBucketMenu("Created At: Year");
      await userEvent.click(
        await screen.findByRole("menuitem", { name: "Month" }),
      );

      expect(onChange).not.toHaveBeenCalled();
      expect(getChipLabels("columns")).toEqual([
        "Created At: Year",
        "Created At: Month",
      ]);
    });

    it.each([
      { breakout: { name: "CREATED_AT", unit: "month" }, bucket: "Month" },
      {
        breakout: { name: "TOTAL", binning: { strategy: "default" } },
        bucket: "Auto binned",
      },
    ] as const)(
      "opens the bucket menu from the $bucket text of a grouping",
      async ({ breakout, bucket }) => {
        setup({
          spec: {
            stages: [
              {
                source: { type: "table", id: ORDERS_ID },
                aggregations: [{ type: "operator", operator: "count" }],
                breakouts: [{ type: "column", ...breakout }],
              },
            ],
          },
        });

        await userEvent.click(screen.getByText(bucket));

        expect(await screen.findAllByRole("menuitem")).not.toHaveLength(0);
      },
    );

    it("changes a number grouping's bins from its menu", async () => {
      const { getLastChange } = setup({
        spec: {
          stages: [
            {
              source: { type: "table", id: ORDERS_ID },
              aggregations: [{ type: "operator", operator: "count" }],
              breakouts: [
                {
                  type: "column",
                  name: "TOTAL",
                  binning: { strategy: "default" },
                },
              ],
            },
          ],
        },
      });

      await openBucketMenu("Total: Auto binned");
      await userEvent.click(
        await screen.findByRole("menuitem", { name: "50 bins" }),
      );

      expect(getLastChange().dimensions).toEqual(["Total: 50 bins"]);
    });

    it("gives no menu to a grouping without units or bins", () => {
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
      expect(
        screen.queryByRole("button", { name: /Change how/ }),
      ).not.toBeInTheDocument();
    });
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

  describe("renaming", () => {
    const spec: TestQuerySpec = {
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          expressions: [
            { name: "Next day", value: { type: "column", name: "CREATED_AT" } },
          ],
          aggregations: [
            { type: "operator", operator: "count" },
            {
              name: "Revenue",
              value: {
                type: "operator",
                operator: "sum",
                args: [{ type: "column", name: "TOTAL" }],
              },
            },
          ],
          breakouts: [
            { type: "column", name: "CREATED_AT", unit: "month" },
            { type: "column", name: "Next day", unit: "month" },
          ],
        },
      ],
    };

    async function renameChip(label: string, name: string, ending: string) {
      await userEvent.dblClick(screen.getByText(label));
      const input = screen.getByRole("textbox", { name: `Rename ${name}` });
      await userEvent.clear(input);
      await userEvent.type(input, `New ${name}${ending}`);
    }

    it("renames a named value on double-click, unless Escape drops the new name", async () => {
      const { onChange, getLastChange } = setup({ spec });

      await renameChip("Revenue", "Revenue", "{Escape}");
      expect(onChange).not.toHaveBeenCalled();
      expect(screen.getByText("Revenue")).toBeInTheDocument();
      expect(getValuesField()).toHaveFocus();

      await renameChip("Revenue", "Revenue", "{Enter}");
      expect(getLastChange().values).toEqual(["Count", "New Revenue"]);
      expect(getValuesField()).toHaveFocus();
    });

    it("renames from the keyboard with F2 on a control of the chip", async () => {
      const { getLastChange } = setup({ spec });
      const removeButton = screen.getByRole("button", {
        name: "Remove Revenue",
      });

      expect(removeButton).toHaveAttribute("aria-keyshortcuts", "F2");
      expect(
        screen.getByRole("button", { name: "Remove Count" }),
      ).not.toHaveAttribute("aria-keyshortcuts");
      removeButton.focus();
      await userEvent.keyboard("{F2}");
      const input = screen.getByRole("textbox", { name: "Rename Revenue" });
      await userEvent.clear(input);
      await userEvent.type(input, "New Revenue{Enter}");

      expect(getLastChange().values).toEqual(["Count", "New Revenue"]);
    });

    it("keeps the new name and moves to the well's field when the well is clicked", async () => {
      const { getLastChange } = setup({ spec });

      await renameChip("Revenue", "Revenue", "");
      await userEvent.click(screen.getByText("Summarize by"));

      expect(getLastChange().values).toEqual(["Count", "New Revenue"]);
      expect(getValuesField()).toHaveFocus();
    });

    it("lets Enter end an IME composition without applying the name", async () => {
      const { onChange } = setup({ spec });

      await userEvent.dblClick(screen.getByText("Revenue"));
      const input = screen.getByRole("textbox", { name: "Rename Revenue" });
      fireEvent.keyDown(input, { key: "Enter", isComposing: true });

      expect(input).toBeInTheDocument();
      expect(onChange).not.toHaveBeenCalled();
    });

    it("renames a custom column grouping with its unit and hands the new name over", async () => {
      const { onChange, getLastChange } = setup({ spec });

      await renameChip("Next day:", "Next day", "{Enter}");

      expect(getLastChange().dimensions).toEqual([
        "Created At: Month",
        "New Next day: Month",
      ]);
      expect(onChange.mock.calls[0][1]).toEqual({
        renamedFormula: { name: "Next day", nextName: "New Next day" },
      });
    });

    it("offers no renaming to a column grouping", async () => {
      setup({ spec });

      await userEvent.dblClick(screen.getByText("Created At:"));

      expect(
        screen.queryByRole("textbox", { name: /^Rename/ }),
      ).not.toBeInTheDocument();
    });
  });

  describe("labels that don't fit", () => {
    const spec: TestQuerySpec = {
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
          breakouts: [
            { type: "column", name: "CREATED_AT", unit: "month" },
            {
              type: "column",
              sourceFieldId: ORDERS.PRODUCT_ID,
              name: "CATEGORY",
            },
          ],
        },
      ],
    };

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it.each([
      ["Count", "Count"],
      ["Sum of Total", "Sum of Total"],
      ["Created At:", "Created At: Month"],
      ["Product → Category", "Product → Category"],
    ])(
      "shows the cut-off %s chip label in full on hover",
      async (text, label) => {
        mockTextOverflow();
        setup({ spec });

        await userEvent.hover(screen.getByText(text));

        expect(await screen.findByRole("tooltip")).toHaveTextContent(label);
      },
    );

    it("shows the full name of a renamed formula instead of its formula", async () => {
      mockTextOverflow();
      setup({
        spec: {
          stages: [
            {
              source: { type: "table", id: ORDERS_ID },
              aggregations: [
                {
                  name: "Revenue after discounts",
                  value: {
                    type: "operator",
                    operator: "/",
                    args: [
                      {
                        type: "operator",
                        operator: "sum",
                        args: [{ type: "column", name: "TOTAL" }],
                      },
                      { type: "operator", operator: "count" },
                    ],
                  },
                },
              ],
            },
          ],
        },
      });

      await userEvent.hover(screen.getByText("Revenue after discounts"));

      const tooltip = await screen.findByRole("tooltip");
      expect(tooltip).toHaveTextContent("Revenue after discounts");
      expect(tooltip).not.toHaveTextContent("Count()");
    });

    it("shows no tooltip for a label that fits", async () => {
      setup({ spec });

      await userEvent.hover(screen.getByText("Sum of Total"));

      await expect(
        screen.findByRole("tooltip", {}, { timeout: 500 }),
      ).rejects.toThrow();
    });
  });
});
