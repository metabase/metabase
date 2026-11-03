import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { useState } from "react";

import {
  setupCardDataset,
  setupCardEndpoints,
  setupMeasureEndpoint,
  setupRecentViewsAndSelectionsEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import {
  fireEvent,
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import type * as Analytics from "metabase/analytics";
import { api, shouldShowNotAuthorizedPage } from "metabase/api/client";
import { METAKEY } from "metabase/utils/browser";
import { checkNotNull } from "metabase/utils/types";
import type {
  CardType,
  ColumnSettings,
  DatasetData,
  GoalForeignColumnRef,
  GoalValue,
  ReferencedEntitiesResults,
  ReferencedEntity,
  RowValues,
  SearchResult,
} from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
  createMockFailedReferencedEntitiesResults,
  createMockField,
  createMockMeasure,
  createMockReferencedEntitiesResults,
  createMockSearchResult,
  createMockStructuredDatasetQuery,
} from "metabase-types/api/mocks";

import { GoalValueInput } from "./GoalValueInput";

const { trackSimpleEvent } =
  jest.requireMock<typeof Analytics>("metabase/analytics");

const DATA = createMockDatasetData({
  cols: [
    createMockColumn({
      name: "count",
      display_name: "Count",
      base_type: "type/Integer",
    }),
    createMockColumn({
      name: "sum",
      display_name: "Sum of Total",
      base_type: "type/Integer",
    }),
  ],
  rows: [[10, 42]],
});

const DATASET_QUERY = createMockStructuredDatasetQuery();

const NUMERIC_FIELDS = [
  createMockField({
    name: "total",
    display_name: "Total",
    base_type: "type/Integer",
  }),
  createMockField({
    name: "avg",
    display_name: "Average",
    base_type: "type/Integer",
  }),
];

type SetupOpts = {
  data?: DatasetData;
  excludedSelfColumn?: string;
  formatOptions?: ColumnSettings;
  referencedEntities?: ReferencedEntity[];
  showSelfColumns?: boolean;
  value?: GoalValue | null;
};

function setup({
  data = DATA,
  excludedSelfColumn,
  formatOptions,
  referencedEntities = [],
  showSelfColumns,
  value = 0,
}: SetupOpts = {}) {
  const onChange = jest.fn();
  renderWithProviders(
    <GoalValueInput
      aria-label="Min"
      data={data}
      datasetQuery={DATASET_QUERY}
      display="progress"
      excludedSelfColumn={excludedSelfColumn}
      formatOptions={formatOptions}
      id="goal-value"
      referencedEntities={referencedEntities}
      showSelfColumns={showSelfColumns}
      value={value}
      onChange={onChange}
    />,
  );
  return { onChange };
}

describe("GoalValueInput", () => {
  it("commits a typed static value on blur", () => {
    const { onChange } = setup({ value: 5 });

    const input = screen.getByRole("textbox", { name: "Min" });
    fireEvent.change(input, { target: { value: "12.5" } });
    fireEvent.blur(input);

    expect(onChange).toHaveBeenCalledWith(12.5);
  });

  it("shows the two source options in the root menu", async () => {
    setup();

    await openMenu();

    expect(
      screen.getByRole("menuitem", { name: /Value from this question/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", {
        name: /Value from another question/,
      }),
    ).toBeInTheDocument();
  });

  it("hides the self-columns option when asked to", async () => {
    setup({ showSelfColumns: false });

    await openMenu();

    expect(
      screen.queryByRole("menuitem", { name: /Value from this question/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /Value from another question/ }),
    ).toBeInTheDocument();
  });

  it("hides the self-columns option when the question has no numeric columns", async () => {
    setup({ data: createMockDatasetData({ cols: [], rows: [] }) });

    await openMenu();

    expect(
      screen.queryByRole("menuitem", { name: /Value from this question/ }),
    ).not.toBeInTheDocument();
  });

  it("lists self columns with their current values and commits on click", async () => {
    const { onChange } = setup();

    await openMenu();
    await userEvent.click(
      screen.getByRole("menuitem", { name: /Value from this question/ }),
    );

    const item = await screen.findByRole("menuitem", {
      name: /Sum of Total/,
    });
    expect(within(item).getByText("42")).toBeInTheDocument();

    await userEvent.click(item);
    expect(onChange).toHaveBeenCalledWith("sum");
  });

  it("keeps the menu open when navigating to the column level with the keyboard (GDGT-3278)", async () => {
    setup();

    await openMenuWithKeyboard();
    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard("{Enter}");
    expect(
      await screen.findByRole("menuitem", { name: /Sum of Total/ }),
    ).toBeInTheDocument();

    await userEvent.keyboard("{ArrowDown}");
    expect(
      screen.getByRole("menuitem", { name: /Value from this question/ }),
    ).toHaveFocus();

    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: /Count/ })).toHaveFocus();
  });

  it("keeps the menu open when navigating back to the root level with the keyboard (GDGT-3278)", async () => {
    setup();

    await openMenuWithKeyboard();
    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard("{Enter}");
    await screen.findByRole("menuitem", { name: /Sum of Total/ });

    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard("{Enter}");
    expect(
      await screen.findByRole("menuitem", {
        name: /Value from another question/,
      }),
    ).toBeInTheDocument();

    await userEvent.keyboard("{ArrowDown}");
    expect(
      screen.getByRole("menuitem", { name: /Value from this question/ }),
    ).toHaveFocus();
  });

  it("returns to the entity picker when navigating back from another question's columns with the keyboard (GDGT-3278)", async () => {
    setupEntityPicker([
      createMockSearchResult({ id: 15, model: "card", name: "Other question" }),
    ]);
    setupCardEndpoints(
      createMockCard({
        id: 9,
        name: "Orders",
        result_metadata: [
          createMockField({ name: "total", base_type: "type/Integer" }),
          createMockField({
            name: "avg",
            display_name: "Average",
            base_type: "type/Integer",
          }),
        ],
      }),
    );
    setupCardDatasetWithReferencedEntities({});
    setup({ value: { type: "card", id: 9, column: "total" } });

    await userEvent.click(
      screen.getByRole("button", { name: "Change value source" }),
    );
    await screen.findByRole("menuitem", { name: /Average/ });

    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: /Orders/ })).toHaveFocus();

    await userEvent.keyboard("{Enter}");
    expect(
      await screen.findByRole("menuitem", { name: /Other question/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /Average/ }),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByPlaceholderText("Search…")).toHaveFocus(),
    );
  });

  it("returns to the entity picker when navigating back from a question picked in the search list with the keyboard (GDGT-3278)", async () => {
    setupEntityPicker([
      createMockSearchResult({ id: 9, model: "card", name: "Orders" }),
    ]);
    setupCardEndpoints(
      createMockCard({
        id: 9,
        name: "Orders",
        result_metadata: [
          createMockField({ name: "total", base_type: "type/Integer" }),
          createMockField({
            name: "avg",
            display_name: "Average",
            base_type: "type/Integer",
          }),
        ],
      }),
    );
    setupCardDatasetWithReferencedEntities({});
    setup();

    await openMenuWithKeyboard();
    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard("{Enter}");
    const searchResult = await screen.findByRole("menuitem", {
      name: /Orders/,
    });
    await waitFor(() =>
      expect(screen.getByPlaceholderText("Search…")).toHaveFocus(),
    );

    await userEvent.keyboard("{ArrowDown}");
    expect(getEntityPickerBackItem()).toHaveFocus();

    await userEvent.keyboard("{ArrowDown}");
    expect(searchResult).toHaveFocus();

    await userEvent.keyboard("{Enter}");
    await screen.findByRole("menuitem", { name: /Average/ });

    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: /Orders/ })).toHaveFocus();

    await userEvent.keyboard("{Enter}");
    await waitFor(() =>
      expect(screen.getByPlaceholderText("Search…")).toHaveFocus(),
    );
    expect(
      screen.getByRole("menuitem", { name: /Orders/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /Average/ }),
    ).not.toBeInTheDocument();
  });

  it("returns to the root menu from the entity picker with the keyboard (GDGT-3278)", async () => {
    setupEntityPicker([
      createMockSearchResult({ id: 15, model: "card", name: "Other question" }),
    ]);
    setup();

    await openMenuWithKeyboard();
    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard("{Enter}");
    await waitFor(() =>
      expect(screen.getByPlaceholderText("Search…")).toHaveFocus(),
    );

    await userEvent.keyboard("{ArrowDown}");
    expect(getEntityPickerBackItem()).toHaveFocus();

    await userEvent.keyboard("{Enter}");
    await screen.findByRole("menuitem", { name: /Value from this question/ });
    expect(screen.queryByTestId("mini-picker")).not.toBeInTheDocument();

    await userEvent.keyboard("{ArrowDown}");
    expect(
      screen.getByRole("menuitem", { name: /Value from this question/ }),
    ).toHaveFocus();
  });

  it("goes back step by step from a picked question's columns to the root menu", async () => {
    setupEntityPicker([
      createMockSearchResult({ id: 9, model: "card", name: "Orders" }),
    ]);
    setupCardEndpoints(
      createMockCard({
        id: 9,
        name: "Orders",
        result_metadata: [
          createMockField({ name: "total", base_type: "type/Integer" }),
          createMockField({
            name: "avg",
            display_name: "Average",
            base_type: "type/Integer",
          }),
        ],
      }),
    );
    setupCardDatasetWithReferencedEntities({});
    setup();

    await openMenu();
    await pickEntity("Orders");
    await screen.findByRole("menuitem", { name: /Average/ });

    await userEvent.click(screen.getByRole("menuitem", { name: /Orders/ }));
    expect(await screen.findByPlaceholderText("Search…")).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /Average/ }),
    ).not.toBeInTheDocument();

    await userEvent.click(getEntityPickerBackItem());
    expect(
      await screen.findByRole("menuitem", { name: /Value from this question/ }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("mini-picker")).not.toBeInTheDocument();
  });

  it("selects the sole numeric column directly from the root menu", async () => {
    const { onChange } = setup({
      data: createMockDatasetData({
        cols: [
          createMockColumn({
            name: "count",
            display_name: "Count",
            base_type: "type/Integer",
          }),
        ],
        rows: [[7]],
      }),
    });

    await openMenu();
    await userEvent.click(
      screen.getByRole("menuitem", { name: /Value from this question/ }),
    );

    expect(onChange).toHaveBeenCalledWith("count");
  });

  it("leaves an excluded column out of the self columns", async () => {
    const { onChange } = setup({ excludedSelfColumn: "sum" });

    await openMenu();
    await userEvent.click(
      screen.getByRole("menuitem", { name: /Value from this question/ }),
    );

    expect(onChange).toHaveBeenCalledWith("count");
  });

  it("still renders an excluded column as a pill when it is the current value", () => {
    setup({ excludedSelfColumn: "sum", value: "sum" });

    const pill = screen.getByRole("button", { name: "Change value source" });
    expect(within(pill).getByText("42")).toBeInTheDocument();
  });

  it("renders a self reference as a pill with the resolved value", () => {
    setup({ value: "sum" });

    const pill = screen.getByRole("button", { name: "Change value source" });
    expect(within(pill).getByText("42")).toBeInTheDocument();
  });

  it("renders a foreign reference pill with the value from referenced_entities", () => {
    setupCardEndpoints(createMockCard({ id: 9, name: "Orders" }));
    setup({
      data: createMockDatasetData({
        ...DATA,
        referenced_entities: createMockReferencedEntitiesResults({
          column: "total",
          value: 250,
        }),
      }),
      value: { type: "card", id: 9, column: "total" },
    });

    const pill = screen.getByRole("button", { name: "Change value source" });
    expect(within(pill).getByText("250")).toBeInTheDocument();
  });

  describe("multi-column source", () => {
    const HIGH_REF = { type: "card", id: 9, column: "HIGH" } as const;

    it("renders the value of the referenced column rather than the first one", () => {
      setupMultiColumnSourceCard();
      setup({
        data: createMockDatasetData({
          ...DATA,
          referenced_entities: createMultiColumnSourceResults([[300, 600]]),
        }),
        value: HIGH_REF,
      });

      const pill = screen.getByRole("button", { name: "Change value source" });
      expect(within(pill).getByText("600")).toBeInTheDocument();
    });

    it("shows an empty pill and an error when the referenced column is null, even though the other column is a number", async () => {
      setupMultiColumnSourceCard();
      setup({
        data: createMockDatasetData({
          ...DATA,
          referenced_entities: createMultiColumnSourceResults([[300, null]]),
        }),
        value: HIGH_REF,
      });

      expect(
        await screen.findByText("This value isn't a number"),
      ).toBeInTheDocument();
      const pill = screen.getByRole("button", { name: "Change value source" });
      expect(within(pill).getByText("—")).toBeInTheDocument();
    });

    it("shows an error when the referenced column is text, even though the other column is a number", async () => {
      setupMultiColumnSourceCard();
      setup({
        data: createMockDatasetData({
          ...DATA,
          referenced_entities: createMultiColumnSourceResults([[300, "text"]]),
        }),
        value: HIGH_REF,
      });

      expect(
        await screen.findByText("This value isn't a number"),
      ).toBeInTheDocument();
    });

    it("shows an error when the source returned no rows", async () => {
      setupMultiColumnSourceCard();
      setup({
        data: createMockDatasetData({
          ...DATA,
          referenced_entities: createMultiColumnSourceResults([]),
        }),
        value: HIGH_REF,
      });

      expect(
        await screen.findByText("This value isn't a number"),
      ).toBeInTheDocument();
    });

    it("shows an error for a column the source no longer has, even though its other columns resolve", async () => {
      setupMultiColumnSourceCard();
      setupCardDatasetWithReferencedEntities(
        createMultiColumnSourceResults([[300, 600]]),
      );
      setup({
        data: createMockDatasetData({
          ...DATA,
          referenced_entities: createMultiColumnSourceResults([[300, 600]]),
        }),
        referencedEntities: [{ type: "card", id: 9 }],
        value: { ...HIGH_REF, column: "MISSING" },
      });

      expect(
        await screen.findByText("This column no longer exists"),
      ).toBeInTheDocument();
      const pill = screen.getByRole("button", { name: "Change value source" });
      expect(within(pill).getByText("—")).toBeInTheDocument();
    });
  });

  it("resolves a reference the dataset can't answer by re-running the query with it attached", async () => {
    setupCardEndpoints(createMockCard({ id: 9, name: "Orders" }));
    setupCardDatasetWithReferencedEntities(
      createMockReferencedEntitiesResults({ column: "total", value: 250 }),
    );
    setup({
      referencedEntities: [{ type: "card", id: 9 }],
      value: { type: "card", id: 9, column: "total" },
    });

    expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();

    const pill = screen.getByRole("button", { name: "Change value source" });
    expect(await within(pill).findByText("250")).toBeInTheDocument();
  });

  it("resolves a column the dataset predates from the card's fresh result", async () => {
    const card = createMockCard({
      id: 9,
      name: "Orders",
      result_metadata: [
        createMockField({
          name: "avg",
          display_name: "Average",
          base_type: "type/Integer",
        }),
      ],
    });
    setupCardEndpoints(card);
    setupCardDatasetWithReferencedEntities({
      card: {
        9: {
          status: "completed",
          data: {
            cols: [
              createMockColumn({ name: "total" }),
              createMockColumn({ name: "avg" }),
            ],
            rows: [[250, 12]],
          },
        },
      },
    });
    setup({
      data: createMockDatasetData({
        ...DATA,
        referenced_entities: createMockReferencedEntitiesResults({
          column: "total",
          value: 250,
        }),
      }),
      referencedEntities: [{ type: "card", id: 9 }],
      value: { type: "card", id: 9, column: "avg" },
    });

    const pill = screen.getByRole("button", { name: "Change value source" });
    expect(await within(pill).findByText("12")).toBeInTheDocument();

    await userEvent.hover(pill);
    expect(await screen.findByText("Orders → Average")).toBeInTheDocument();
  });

  it("shows an error instead of spinning forever when the resolving query fails", async () => {
    setupCardEndpoints(createMockCard({ id: 9, name: "Orders" }));
    fetchMock.post("path:/api/dataset", 500);
    setup({
      referencedEntities: [{ type: "card", id: 9 }],
      value: { type: "card", id: 9, column: "total" },
    });

    expect(
      await screen.findByText("Couldn't load this value"),
    ).toBeInTheDocument();
  });

  it("explains that a referenced question must return a single row", async () => {
    setupCardEndpoints(
      createMockCard({ id: 9, name: "Orders", type: "question" }),
    );
    setup({
      data: createMockDatasetData({
        ...DATA,
        referenced_entities: createMockFailedReferencedEntitiesResults({
          error:
            "Referenced card 9 returned more rows than the requested maximum of 1.",
          error_type: "too-many-rows",
        }),
      }),
      value: { type: "card", id: 9, column: "total" },
    });

    expect(
      await screen.findByText(
        "The question's result must be a single value or row.",
      ),
    ).toBeInTheDocument();
  });

  it("explains that a referenced model must return a single row", async () => {
    setupCardEndpoints(
      createMockCard({ id: 9, name: "Orders", type: "model" }),
    );
    setup({
      data: createMockDatasetData({
        ...DATA,
        referenced_entities: createMockFailedReferencedEntitiesResults({
          error:
            "Referenced card 9 returned more rows than the requested maximum of 1.",
          error_type: "too-many-rows",
        }),
      }),
      value: { type: "card", id: 9, column: "total" },
    });

    expect(
      await screen.findByText(
        "The model's result must be a single value or row.",
      ),
    ).toBeInTheDocument();
  });

  it("explains that a referenced metric must return a single row", async () => {
    setupCardEndpoints(
      createMockCard({ id: 9, name: "Orders", type: "metric" }),
    );
    setup({
      data: createMockDatasetData({
        ...DATA,
        referenced_entities: createMockFailedReferencedEntitiesResults({
          error:
            "Referenced card 9 returned more rows than the requested maximum of 1.",
          error_type: "too-many-rows",
        }),
      }),
      value: { type: "card", id: 9, column: "total" },
    });

    expect(
      await screen.findByText(
        "The metric's result must be a single value or row.",
      ),
    ).toBeInTheDocument();
  });

  it("explains that a referenced measure must return a single row", async () => {
    setupMeasureEndpoint(
      createMockMeasure({
        id: 4,
        name: "Total revenue",
        result_column_name: "revenue",
      }),
    );
    setup({
      data: createMockDatasetData({
        ...DATA,
        referenced_entities: createMockFailedReferencedEntitiesResults({
          type: "measure",
          id: 4,
          error:
            "Referenced measure 4 returned more rows than the requested maximum of 1.",
          error_type: "too-many-rows",
        }),
      }),
      value: { type: "measure", id: 4, column: "revenue" },
    });

    expect(
      await screen.findByText(
        "The measure's result must be a single value or row.",
      ),
    ).toBeInTheDocument();
  });

  it("shows an empty pill and an error for a referenced column that no longer exists", async () => {
    setupCardEndpoints(createMockCard({ id: 9, name: "Orders" }));
    setupCardDatasetWithReferencedEntities(
      createMockReferencedEntitiesResults({ column: "total", value: 250 }),
    );
    setup({
      data: createMockDatasetData({
        ...DATA,
        referenced_entities: createMockReferencedEntitiesResults({
          column: "total",
          value: 250,
        }),
      }),
      referencedEntities: [{ type: "card", id: 9 }],
      value: { type: "card", id: 9, column: "avg" },
    });

    expect(
      await screen.findByText("This column no longer exists"),
    ).toBeInTheDocument();

    const pill = screen.getByRole("button", { name: "Change value source" });
    expect(within(pill).getByText("—")).toBeInTheDocument();
  });

  it("explains that a referenced question no longer exists", async () => {
    setupCardEndpoints(createMockCard({ id: 9, name: "Orders" }));
    setup({
      data: createMockDatasetData({
        ...DATA,
        referenced_entities: createMockFailedReferencedEntitiesResults({
          error: "Not found.",
          error_type: "not-found",
        }),
      }),
      value: { type: "card", id: 9, column: "total" },
    });

    expect(
      await screen.findByText("This question no longer exists"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Not found.")).not.toBeInTheDocument();
  });

  it("explains that a deleted card, which can't tell its kind, no longer exists", async () => {
    setupDeletedCard();
    setup({
      data: createMockDatasetData({
        ...DATA,
        referenced_entities: createMockFailedReferencedEntitiesResults({
          error: "Not found.",
          error_type: "not-found",
        }),
      }),
      value: { type: "card", id: 9, column: "total" },
    });

    expect(
      await screen.findByText("This source no longer exists"),
    ).toBeInTheDocument();
  });

  it("exposes the menu relationship on the pill for a11y", () => {
    setup({ value: "sum" });

    expect(screen.getByRole("group", { name: "Min" })).toHaveAttribute(
      "aria-haspopup",
      "menu",
    );
  });

  it("clears the reference with the remove button", async () => {
    const { onChange } = setup({ value: "sum" });

    await userEvent.click(
      screen.getByRole("button", { name: "Remove value source" }),
    );

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("clears the reference with backspace", () => {
    const { onChange } = setup({ value: "sum" });

    const pill = screen.getByRole("group", { name: "Min" });
    fireEvent.keyDown(pill, { key: "Backspace" });

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("moves focus to the static input after deleting the pill with backspace", async () => {
    renderWithProviders(<ControlledGoalValueInput />);

    const pill = screen.getByRole("group", { name: "Min" });
    fireEvent.keyDown(pill, { key: "Backspace" });

    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Min" })).toHaveFocus(),
    );
  });

  it("moves focus to the static input after clearing the reference with the remove button", async () => {
    renderWithProviders(<ControlledGoalValueInput />);

    await userEvent.click(
      screen.getByRole("button", { name: "Remove value source" }),
    );

    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Min" })).toHaveFocus(),
    );
  });

  it("does not open the menu when clicking the static input itself", async () => {
    setup({ value: 5 });

    await userEvent.click(screen.getByRole("textbox", { name: "Min" }));

    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
  });

  it("opens the column submenu with the current column highlighted when clicking the pill", async () => {
    const { onChange } = setup({ value: "sum" });

    await userEvent.click(
      screen.getByRole("button", { name: "Change value source" }),
    );

    const item = await screen.findByRole("menuitem", { name: /Count/ });
    await userEvent.click(item);

    expect(onChange).toHaveBeenCalledWith("count");
  });

  it("opens the root menu when clicking the pill of this question's only numeric column", async () => {
    setup({
      data: createMockDatasetData({
        cols: [
          createMockColumn({
            name: "count",
            display_name: "Count",
            base_type: "type/Integer",
          }),
        ],
        rows: [[7]],
      }),
      value: "count",
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Change value source" }),
    );

    expect(
      await screen.findByRole("menuitem", {
        name: /Value from another question/,
      }),
    ).toBeInTheDocument();
  });

  it("opens the root menu when clicking the pill of another question with a single numeric column", async () => {
    setupCardEndpoints(
      createMockCard({
        id: 9,
        name: "Orders",
        result_metadata: [
          createMockField({
            name: "total",
            display_name: "Total",
            base_type: "type/Integer",
          }),
        ],
      }),
    );
    setup({
      data: createMockDatasetData({
        ...DATA,
        referenced_entities: createMockReferencedEntitiesResults({
          column: "total",
          value: 250,
        }),
      }),
      value: { type: "card", id: 9, column: "total" },
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Change value source" }),
    );

    expect(
      await screen.findByRole("menuitem", {
        name: /Value from another question/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /Value from this question/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /Total/ }),
    ).not.toBeInTheDocument();
  });

  it("resolves a measure reference and treats it as a single-column source", async () => {
    setupMeasureEndpoint(
      createMockMeasure({
        id: 4,
        name: "Total revenue",
        result_column_name: "revenue",
      }),
    );
    setup({
      data: createMockDatasetData({
        ...DATA,
        referenced_entities: createMockReferencedEntitiesResults({
          type: "measure",
          id: 4,
          column: "revenue",
          value: 999,
        }),
      }),
      value: { type: "measure", id: 4, column: "revenue" },
    });

    const pill = screen.getByRole("button", { name: "Change value source" });
    expect(within(pill).getByText("999")).toBeInTheDocument();

    // a measure has a single column, so clicking the pill opens the root menu
    await userEvent.click(pill);
    expect(
      await screen.findByRole("menuitem", {
        name: /Value from another question/,
      }),
    ).toBeInTheDocument();
  });

  it("keeps describing the committed reference after an entity pick is abandoned", async () => {
    setupEntityPicker([
      createMockSearchResult({ id: 15, model: "card", name: "Other question" }),
    ]);
    setupCardEndpoints(createMockCard({ id: 9, name: "Orders" }));
    const otherCard = createMockCard({
      id: 15,
      name: "Other question",
      result_metadata: [
        createMockField({
          name: "revenue",
          display_name: "Revenue",
          base_type: "type/Integer",
        }),
        createMockField({
          name: "target",
          display_name: "Target",
          base_type: "type/Integer",
        }),
      ],
    });
    setupCardEndpoints(otherCard);
    setupCardDatasetWithReferencedEntities({
      card: {
        15: {
          status: "completed",
          data: {
            cols: [
              createMockColumn({ name: "revenue" }),
              createMockColumn({ name: "target" }),
            ],
            rows: [[100, 200]],
          },
        },
      },
    });
    setup({
      data: createMockDatasetData({
        ...DATA,
        referenced_entities: createMockReferencedEntitiesResults({
          column: "total",
          value: 250,
        }),
      }),
      value: { type: "card", id: 9, column: "total" },
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Change value source" }),
    );
    await pickEntity("Other question");

    // the pick has two numeric columns, so the menu waits on the entity level
    expect(
      await screen.findByRole("menuitem", { name: /Revenue/ }),
    ).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        screen.queryByRole("menuitem", { name: /Revenue/ }),
      ).not.toBeInTheDocument(),
    );

    await userEvent.hover(
      screen.getByRole("button", { name: "Change value source" }),
    );
    expect(await screen.findByText("Orders → total")).toBeInTheDocument();
    expect(screen.queryByText(/Other question/)).not.toBeInTheDocument();
  });

  it("searches questions, but not models, when the instance has no measures or metrics", async () => {
    setupEntityPicker([
      createMockSearchResult({ id: 15, model: "card", name: "Other question" }),
    ]);
    setup();

    await openMenu();
    await userEvent.click(
      screen.getByRole("menuitem", { name: /Value from another question/ }),
    );
    expect(await screen.findByText("Other question")).toBeInTheDocument();

    const url = new URL(
      checkNotNull(fetchMock.callHistory.lastCall("path:/api/search")).url,
    );
    expect(url.searchParams.getAll("models")).toEqual(["card"]);
    expect(url.searchParams.get("limit")).toBe("5");
    expect(url.searchParams.has("ids")).toBe(false);
  });

  it("commits a single-column pick without opening the column list", async () => {
    setupEntityPicker([
      createMockSearchResult({ id: 4, model: "measure", name: "Revenue" }),
    ]);
    setupMeasureEndpoint(
      createMockMeasure({
        id: 4,
        name: "Revenue",
        result_column_name: "revenue",
      }),
    );
    const { onChange } = setup();

    await openMenu();
    await pickEntity("Revenue");

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({
        type: "measure",
        id: 4,
        column: "revenue",
      }),
    );
    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
  });

  it("commits the sole column of a metric picked from search as a card reference", async () => {
    setupEntityPicker([
      createMockSearchResult({ id: 9, model: "metric", name: "Revenue" }),
    ]);
    setupCardEndpoints(
      createMockCard({
        id: 9,
        name: "Revenue",
        type: "metric",
        result_metadata: [
          createMockField({ name: "sum", base_type: "type/Integer" }),
        ],
      }),
    );
    const { onChange } = setup();

    await openMenu();
    await pickEntity("Revenue");

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({
        type: "card",
        id: 9,
        column: "sum",
      }),
    );
  });

  it("commits the only numeric column of a source that also has non-numeric columns", async () => {
    setupEntityPicker([
      createMockSearchResult({ id: 9, model: "card", name: "Orders" }),
    ]);
    setupCardEndpoints(
      createMockCard({
        id: 9,
        name: "Orders",
        result_metadata: [
          createMockField({ name: "name", base_type: "type/Text" }),
          createMockField({ name: "total", base_type: "type/Integer" }),
          createMockField({ name: "created_at", base_type: "type/DateTime" }),
        ],
      }),
    );
    const { onChange } = setup();

    await openMenu();
    await pickEntity("Orders");

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({
        type: "card",
        id: 9,
        column: "total",
      }),
    );
  });

  it("shows values for all of the entity's columns", async () => {
    const card = createMockCard({
      id: 9,
      name: "Orders",
      result_metadata: [
        createMockField({
          name: "total",
          display_name: "Total",
          base_type: "type/Integer",
        }),
        createMockField({
          name: "avg",
          display_name: "Average",
          base_type: "type/Integer",
        }),
      ],
    });
    setupCardEndpoints(card);
    setupCardDatasetWithReferencedEntities({
      card: {
        9: {
          status: "completed",
          data: {
            cols: [
              createMockColumn({ name: "total" }),
              createMockColumn({ name: "avg" }),
            ],
            rows: [[250, 12]],
          },
        },
      },
    });
    setup({
      data: createMockDatasetData({
        ...DATA,
        referenced_entities: createMockReferencedEntitiesResults({
          column: "total",
          value: 250,
        }),
      }),
      value: { type: "card", id: 9, column: "total" },
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Change value source" }),
    );

    const item = await screen.findByRole("menuitem", { name: /Average/ });
    expect(await within(item).findByText("12")).toBeInTheDocument();
    expect(
      within(screen.getByRole("menuitem", { name: /Total/ })).getByText("250"),
    ).toBeInTheDocument();
  });

  it("disables the columns of a question that returns multiple rows and explains why (UIT-145)", async () => {
    const { onChange } = setupMultiRowEntity({ type: "question" });

    await openMenu();
    await pickEntity("Orders");

    expect(
      await screen.findByText(
        "The question's result must be a single value or row.",
      ),
    ).toBeInTheDocument();
    const totalItem = screen.getByRole("menuitem", { name: /Total/ });
    expect(totalItem).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: /Average/ })).toBeDisabled();

    await userEvent.click(totalItem, { pointerEventsCheck: 0 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("explains that a model must return a single row when disabling its columns (UIT-145)", async () => {
    setupMultiRowEntity({ type: "model" });

    await openMenu();
    await pickEntity("Orders");

    expect(
      await screen.findByText(
        "The model's result must be a single value or row.",
      ),
    ).toBeInTheDocument();
  });

  it("keeps the back item reachable with the keyboard when the columns are disabled (UIT-145)", async () => {
    setupMultiRowEntity({ type: "question" });

    await openMenu();
    await pickEntity("Orders");
    await screen.findByText(
      "The question's result must be a single value or row.",
    );

    await userEvent.keyboard("{ArrowDown}");

    expect(screen.getByRole("menuitem", { name: /Orders/ })).toHaveFocus();
  });

  it("disables the columns when the fresh result rejects a question the dataset could still answer (UIT-145)", async () => {
    setupCardEndpoints(
      createMockCard({ id: 9, result_metadata: NUMERIC_FIELDS }),
    );
    setupCardDatasetWithReferencedEntities(
      createMockFailedReferencedEntitiesResults({
        error_type: "too-many-rows",
      }),
    );
    setup({
      data: createMockDatasetData({
        ...DATA,
        referenced_entities: createMockReferencedEntitiesResults({
          column: "total",
          value: 250,
        }),
      }),
      value: { type: "card", id: 9, column: "total" },
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Change value source" }),
    );

    await waitFor(() => {
      expect(screen.getByRole("menuitem", { name: /Total/ })).toBeDisabled();
    });
  });

  // only a column list can disable a choice, so a sole column is committed and reported afterwards
  it("commits the sole column of a question that returns multiple rows", async () => {
    setupEntityPicker([
      createMockSearchResult({ id: 9, model: "card", name: "Orders" }),
    ]);
    setupCardEndpoints(
      createMockCard({
        id: 9,
        name: "Orders",
        result_metadata: [NUMERIC_FIELDS[0]],
      }),
    );
    setupCardDatasetWithReferencedEntities(
      createMockFailedReferencedEntitiesResults({
        error_type: "too-many-rows",
      }),
    );
    const { onChange } = setup();

    await openMenu();
    await pickEntity("Orders");

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({
        type: "card",
        id: 9,
        column: "total",
      });
    });
  });

  it("keeps the columns enabled when the question returns a single row (UIT-145)", async () => {
    setupCardEndpoints(
      createMockCard({ id: 9, result_metadata: NUMERIC_FIELDS }),
    );
    setupCardDatasetWithReferencedEntities({
      card: {
        9: {
          status: "completed",
          data: {
            cols: [
              createMockColumn({ name: "total" }),
              createMockColumn({ name: "avg" }),
            ],
            rows: [[250, 12]],
          },
        },
      },
    });
    setup({
      data: createMockDatasetData({
        ...DATA,
        referenced_entities: createMockReferencedEntitiesResults({
          column: "total",
          value: 250,
        }),
      }),
      value: { type: "card", id: 9, column: "total" },
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Change value source" }),
    );

    const item = await screen.findByRole("menuitem", { name: /Average/ });
    expect(await within(item).findByText("12")).toBeInTheDocument();
    expect(item).toBeEnabled();
    expect(
      screen.queryByText(
        "The question's result must be a single value or row.",
      ),
    ).not.toBeInTheDocument();
  });

  describe("formatting with the chart's format options", () => {
    const FORMAT_OPTIONS: ColumnSettings = { prefix: "~" };

    it("formats the columns of this question", async () => {
      setup({ formatOptions: FORMAT_OPTIONS });

      await openMenu();
      await userEvent.click(
        screen.getByRole("menuitem", { name: /Value from this question/ }),
      );

      const item = await screen.findByRole("menuitem", {
        name: /Sum of Total/,
      });
      expect(within(item).getByText("~42")).toBeInTheDocument();
    });

    it("formats a reference to a column of this question", () => {
      setup({ formatOptions: FORMAT_OPTIONS, value: "sum" });

      const pill = screen.getByRole("button", { name: "Change value source" });
      expect(within(pill).getByText("~42")).toBeInTheDocument();
    });

    it("formats a reference to another question and that question's columns", async () => {
      setupCardEndpoints(
        createMockCard({
          id: 9,
          name: "Orders",
          result_metadata: [
            createMockField({
              name: "total",
              display_name: "Total",
              base_type: "type/Integer",
            }),
            createMockField({
              name: "avg",
              display_name: "Average",
              base_type: "type/Integer",
            }),
          ],
        }),
      );
      setupCardDatasetWithReferencedEntities({
        card: {
          9: {
            status: "completed",
            data: {
              cols: [
                createMockColumn({ name: "total" }),
                createMockColumn({ name: "avg" }),
              ],
              rows: [[250, 12]],
            },
          },
        },
      });
      setup({
        data: createMockDatasetData({
          ...DATA,
          referenced_entities: createMockReferencedEntitiesResults({
            column: "total",
            value: 250,
          }),
        }),
        formatOptions: FORMAT_OPTIONS,
        value: { type: "card", id: 9, column: "total" },
      });

      const pill = screen.getByRole("button", { name: "Change value source" });
      expect(within(pill).getByText("~250")).toBeInTheDocument();

      await userEvent.click(pill);

      const item = await screen.findByRole("menuitem", { name: /Average/ });
      expect(await within(item).findByText("~12")).toBeInTheDocument();
    });
  });

  it("offers another question as a source when this question has no numeric columns", async () => {
    setup({
      data: createMockDatasetData({ cols: [], rows: [] }),
      value: 5,
    });

    await openMenu();

    expect(
      screen.getByRole("menuitem", { name: /Value from another question/ }),
    ).toBeInTheDocument();
  });

  it("does not clear a reference it cannot render when the static input is blurred", () => {
    const { onChange } = setup({
      data: createMockDatasetData({
        cols: [
          createMockColumn({
            name: "count",
            display_name: "Count",
            base_type: "type/Integer",
          }),
        ],
        rows: [[10]],
      }),
      value: "gone",
    });

    const input = screen.getByRole("textbox", { name: "Min" });
    expect(input).toHaveValue("");

    fireEvent.focus(input);
    fireEvent.blur(input);

    expect(onChange).not.toHaveBeenCalled();
  });

  it("still commits a typed value over a reference it cannot render", () => {
    const { onChange } = setup({
      data: createMockDatasetData({
        cols: [
          createMockColumn({
            name: "count",
            display_name: "Count",
            base_type: "type/Integer",
          }),
        ],
        rows: [[10]],
      }),
      value: "gone",
    });

    const input = screen.getByRole("textbox", { name: "Min" });
    fireEvent.change(input, { target: { value: "7" } });
    fireEvent.blur(input);

    expect(onChange).toHaveBeenCalledWith(7);
  });

  it("reports a failure instead of spinning forever when the entity metadata can't be loaded", async () => {
    setupEntityPicker([
      createMockSearchResult({
        id: 15,
        model: "card",
        name: "Broken question",
      }),
    ]);
    fetchMock.get("path:/api/card/15", 403);
    setup();

    await openMenu();
    await pickEntity("Broken question");

    expect(
      await screen.findByRole("menuitem", {
        name: "Couldn't load this source",
      }),
    ).toBeInTheDocument();
  });

  describe("permission errors", () => {
    const forbiddenUrls: string[] = [];
    const recordForbiddenUrl = (url: string) => forbiddenUrls.push(url);

    beforeEach(() => {
      forbiddenUrls.length = 0;
      api.on(403, recordForbiddenUrl);
    });

    afterEach(() => {
      api.off(403, recordForbiddenUrl);
    });

    it("does not show the not-authorized page for a question the user can't access (GDGT-3252)", async () => {
      const cardResponse = Promise.withResolvers<number>();
      fetchMock.get("path:/api/card/9", () => cardResponse.promise);
      setup({
        data: createMockDatasetData({
          ...DATA,
          referenced_entities: {
            card: {
              9: {
                status: "completed",
                data: {
                  cols: [createMockColumn({ name: "total" })],
                  rows: [[250]],
                },
              },
            },
          },
        }),
        value: { type: "card", id: 9, column: "total" },
      });

      // opened while loading, the pill lands on the source's column list
      await userEvent.click(
        screen.getByRole("button", { name: "Change value source" }),
      );
      cardResponse.resolve(403);

      expect(
        await screen.findByRole("menuitem", {
          name: "Couldn't load this source",
        }),
      ).toBeInTheDocument();
      expect(forbiddenUrls.filter(shouldShowNotAuthorizedPage)).toEqual([]);
    });

    it("does not show the not-authorized page for a measure the user can't access", async () => {
      fetchMock.get("path:/api/measure/4", 403);
      setup({
        data: createMockDatasetData({
          ...DATA,
          referenced_entities: {
            measure: {
              4: {
                status: "completed",
                data: {
                  cols: [createMockColumn({ name: "revenue" })],
                  rows: [[999]],
                },
              },
            },
          },
        }),
        value: { type: "measure", id: 4, column: "revenue" },
      });

      await waitFor(() => {
        expect(forbiddenUrls).toContain("/api/measure/4");
      });
      expect(forbiddenUrls.filter(shouldShowNotAuthorizedPage)).toEqual([]);
    });
  });

  it("says so when the picked source has no numeric columns", async () => {
    setupEntityPicker([
      createMockSearchResult({ id: 15, model: "card", name: "No numbers" }),
    ]);
    setupCardEndpoints(
      createMockCard({ id: 15, name: "No numbers", result_metadata: [] }),
    );
    setup();

    await openMenu();
    await pickEntity("No numbers");

    expect(
      await screen.findByRole("menuitem", { name: "No numeric columns" }),
    ).toBeInTheDocument();
  });

  describe("opening the source in a new tab", () => {
    const NEW_TAB_HINT = `${METAKEY}+click to open in new tab`;

    function setupSource(value: GoalForeignColumnRef) {
      const mockWindowOpen = jest.spyOn(window, "open").mockImplementation();

      setup({
        data: createMockDatasetData({
          ...DATA,
          referenced_entities: {
            [value.type]: {
              [value.id]: {
                status: "completed",
                data: {
                  cols: [createMockColumn({ name: value.column })],
                  rows: [[250]],
                },
              },
            },
          },
        }),
        value,
      });

      return { mockWindowOpen };
    }

    function setupCardSource() {
      setupCardEndpoints(
        createMockCard({ id: 9, name: "Orders", type: "question" }),
      );

      return setupSource({ type: "card", id: 9, column: "total" });
    }

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("shows a hint in the pill tooltip", async () => {
      setupCardSource();

      await getLoadedPill();

      const tooltip = screen.getByRole("tooltip");
      expect(tooltip).toHaveTextContent("Orders → total");
      expect(tooltip).toHaveTextContent(NEW_TAB_HINT);
    });

    it.each([{ ctrlKey: true }, { metaKey: true }])(
      "opens the source card on click with %o",
      async (modifier) => {
        const { mockWindowOpen } = setupCardSource();

        fireEvent.click(await getLoadedPill(), modifier);

        expect(mockWindowOpen).toHaveBeenCalledWith(
          "/question/9-orders",
          "_blank",
        );
        expect(screen.queryByRole("menu")).not.toBeInTheDocument();
      },
    );

    it("opens the source card on middle click", async () => {
      const { mockWindowOpen } = setupCardSource();

      fireEvent(
        await getLoadedPill(),
        new MouseEvent("auxclick", { bubbles: true, button: 1 }),
      );

      expect(mockWindowOpen).toHaveBeenCalledWith(
        "/question/9-orders",
        "_blank",
      );
    });

    it("opens the menu on a regular click", async () => {
      const { mockWindowOpen } = setupCardSource();

      await userEvent.click(await getLoadedPill());

      expect(await screen.findByRole("menu")).toBeInTheDocument();
      expect(mockWindowOpen).not.toHaveBeenCalled();
    });

    it("opens a measure source in the metrics explorer", async () => {
      setupMeasureEndpoint(
        createMockMeasure({ id: 4, result_column_name: "revenue" }),
      );
      const { mockWindowOpen } = setupSource({
        type: "measure",
        id: 4,
        column: "revenue",
      });

      fireEvent.click(await getLoadedPill(), { ctrlKey: true });

      expect(mockWindowOpen).toHaveBeenCalledWith(
        "/explore?measureId=4",
        "_blank",
      );
    });

    it("has nothing to open for a column of this question", async () => {
      const mockWindowOpen = jest.spyOn(window, "open").mockImplementation();
      setup({ value: "sum" });
      const pill = screen.getByRole("button", { name: "Change value source" });

      await userEvent.hover(pill);
      expect(await screen.findByRole("tooltip")).toHaveTextContent(
        "Sum of Total",
      );
      expect(screen.queryByText(NEW_TAB_HINT)).not.toBeInTheDocument();

      fireEvent.click(pill, { ctrlKey: true });
      expect(await screen.findByRole("menu")).toBeInTheDocument();
      expect(mockWindowOpen).not.toHaveBeenCalled();
    });

    async function getLoadedPill() {
      const pill = screen.getByRole("button", { name: "Change value source" });
      await userEvent.hover(pill);
      await screen.findByText(NEW_TAB_HINT);
      return pill;
    }
  });

  describe("analytics", () => {
    beforeEach(() => {
      jest.mocked(trackSimpleEvent).mockClear();
    });

    it("tracks picking a column of this question", async () => {
      setup();

      await openMenu();
      await userEvent.click(
        screen.getByRole("menuitem", { name: /Value from this question/ }),
      );
      await userEvent.click(
        await screen.findByRole("menuitem", { name: /Sum of Total/ }),
      );

      expect(trackSimpleEvent).toHaveBeenCalledTimes(1);
      expect(trackSimpleEvent).toHaveBeenCalledWith({
        event: "dynamic_goal_set",
        triggered_from: "progress",
        event_detail: "self_column",
      });
    });

    it("tracks picking a single-column measure", async () => {
      setupEntityPicker([
        createMockSearchResult({ id: 4, model: "measure", name: "Revenue" }),
      ]);
      setupMeasureEndpoint(
        createMockMeasure({
          id: 4,
          name: "Revenue",
          result_column_name: "revenue",
        }),
      );
      const { onChange } = setup();

      await openMenu();
      await pickEntity("Revenue");

      await waitFor(() => expect(onChange).toHaveBeenCalled());
      expect(trackSimpleEvent).toHaveBeenCalledTimes(1);
      expect(trackSimpleEvent).toHaveBeenCalledWith({
        event: "dynamic_goal_set",
        triggered_from: "progress",
        event_detail: "measure",
      });
    });

    it("tracks picking a single-column question with its card type", async () => {
      setupEntityPicker([
        createMockSearchResult({ id: 9, model: "card", name: "Orders" }),
      ]);
      setupCardEndpoints(
        createMockCard({
          id: 9,
          name: "Orders",
          type: "model",
          result_metadata: [
            createMockField({ name: "total", base_type: "type/Integer" }),
          ],
        }),
      );
      const { onChange } = setup();

      await openMenu();
      await pickEntity("Orders");

      await waitFor(() =>
        expect(onChange).toHaveBeenCalledWith({
          type: "card",
          id: 9,
          column: "total",
        }),
      );
      expect(trackSimpleEvent).toHaveBeenCalledTimes(1);
      expect(trackSimpleEvent).toHaveBeenCalledWith({
        event: "dynamic_goal_set",
        triggered_from: "progress",
        event_detail: "model",
      });
    });

    it("tracks picking a column of a multi-column question with its card type", async () => {
      setupEntityPicker([
        createMockSearchResult({ id: 9, model: "card", name: "Orders" }),
      ]);
      setupCardEndpoints(
        createMockCard({
          id: 9,
          name: "Orders",
          type: "metric",
          result_metadata: [
            createMockField({ name: "total", base_type: "type/Integer" }),
            createMockField({
              name: "avg",
              display_name: "Average",
              base_type: "type/Integer",
            }),
          ],
        }),
      );
      setupCardDatasetWithReferencedEntities({});
      const { onChange } = setup();

      await openMenu();
      await pickEntity("Orders");
      expect(trackSimpleEvent).not.toHaveBeenCalled();
      await userEvent.click(
        await screen.findByRole("menuitem", { name: /Average/ }),
      );

      expect(onChange).toHaveBeenCalledWith({
        type: "card",
        id: 9,
        column: "avg",
      });
      expect(trackSimpleEvent).toHaveBeenCalledTimes(1);
      expect(trackSimpleEvent).toHaveBeenCalledWith({
        event: "dynamic_goal_set",
        triggered_from: "progress",
        event_detail: "metric",
      });
    });

    it("tracks replacing a column of this question with another one", async () => {
      const { onChange } = setup({ value: "sum" });

      await userEvent.click(
        screen.getByRole("button", { name: "Change value source" }),
      );
      await userEvent.click(
        await screen.findByRole("menuitem", { name: /Count/ }),
      );

      expect(onChange).toHaveBeenCalledWith("count");
      expect(trackSimpleEvent).toHaveBeenCalledTimes(1);
      expect(trackSimpleEvent).toHaveBeenCalledWith({
        event: "dynamic_goal_replaced",
        triggered_from: "progress",
        event_detail: "self_column",
      });
    });

    it("tracks replacing a column of another question with its card type", async () => {
      setupCardEndpoints(
        createMockCard({
          id: 9,
          name: "Orders",
          type: "model",
          result_metadata: [
            createMockField({ name: "total", base_type: "type/Integer" }),
            createMockField({
              name: "avg",
              display_name: "Average",
              base_type: "type/Integer",
            }),
          ],
        }),
      );
      setupCardDatasetWithReferencedEntities({});
      const { onChange } = setup({
        value: { type: "card", id: 9, column: "total" },
      });

      await userEvent.click(
        screen.getByRole("button", { name: "Change value source" }),
      );
      await userEvent.click(
        await screen.findByRole("menuitem", { name: /Average/ }),
      );

      expect(onChange).toHaveBeenCalledWith({
        type: "card",
        id: 9,
        column: "avg",
      });
      expect(trackSimpleEvent).toHaveBeenCalledTimes(1);
      expect(trackSimpleEvent).toHaveBeenCalledWith({
        event: "dynamic_goal_replaced",
        triggered_from: "progress",
        event_detail: "model",
      });
    });

    it("does not track picking the column that is already the goal", async () => {
      const { onChange } = setup({ value: "sum" });

      await userEvent.click(
        screen.getByRole("button", { name: "Change value source" }),
      );
      await userEvent.click(
        await screen.findByRole("menuitem", { name: /Sum of Total/ }),
      );

      expect(onChange).toHaveBeenCalledWith("sum");
      expect(trackSimpleEvent).not.toHaveBeenCalled();
    });

    it("does not track typing a static value", () => {
      const { onChange } = setup({ value: 5 });

      const input = screen.getByRole("textbox", { name: "Min" });
      fireEvent.change(input, { target: { value: "12.5" } });
      fireEvent.blur(input);

      expect(onChange).toHaveBeenCalledWith(12.5);
      expect(trackSimpleEvent).not.toHaveBeenCalled();
    });

    it("tracks removing a column of this question", async () => {
      setup({ value: "sum" });

      await userEvent.click(
        screen.getByRole("button", { name: "Remove value source" }),
      );

      expect(trackSimpleEvent).toHaveBeenCalledTimes(1);
      expect(trackSimpleEvent).toHaveBeenCalledWith({
        event: "dynamic_goal_unset",
        triggered_from: "progress",
        event_detail: "self_column",
      });
    });

    it("tracks removing a column of another question with backspace", async () => {
      setupCardEndpoints(
        createMockCard({ id: 9, name: "Orders", type: "metric" }),
      );
      setup({
        data: createMockDatasetData({
          ...DATA,
          referenced_entities: createMockReferencedEntitiesResults({
            column: "total",
            value: 250,
          }),
        }),
        value: { type: "card", id: 9, column: "total" },
      });

      const pill = screen.getByRole("group", { name: "Min" });
      await userEvent.hover(
        screen.getByRole("button", { name: "Change value source" }),
      );
      expect(await screen.findByText("Orders → total")).toBeInTheDocument();
      fireEvent.keyDown(pill, { key: "Backspace" });

      expect(trackSimpleEvent).toHaveBeenCalledTimes(1);
      expect(trackSimpleEvent).toHaveBeenCalledWith({
        event: "dynamic_goal_unset",
        triggered_from: "progress",
        event_detail: "metric",
      });
    });
  });
});

function setupCardDatasetWithReferencedEntities(
  referencedEntities: ReferencedEntitiesResults,
) {
  setupCardDataset({
    dataset: {
      data: createMockDatasetData({ referenced_entities: referencedEntities }),
    },
  });
}

function setupMultiColumnSourceCard() {
  setupCardEndpoints(
    createMockCard({
      id: 9,
      name: "Low and high",
      result_metadata: [
        createMockField({ name: "LOW", base_type: "type/Integer" }),
        createMockField({ name: "HIGH", base_type: "type/Integer" }),
      ],
    }),
  );
}

function createMultiColumnSourceResults(
  rows: RowValues[],
): ReferencedEntitiesResults {
  return {
    card: {
      9: {
        status: "completed",
        data: {
          cols: [
            createMockColumn({ name: "LOW" }),
            createMockColumn({ name: "HIGH" }),
          ],
          rows,
        },
      },
    },
  };
}

function setupDeletedCard() {
  fetchMock.get("path:/api/card/9", 404);
}

function setupMultiRowEntity({ type }: { type: CardType }) {
  setupEntityPicker([
    createMockSearchResult({ id: 9, model: "card", name: "Orders" }),
  ]);
  setupCardEndpoints(
    createMockCard({
      id: 9,
      name: "Orders",
      result_metadata: NUMERIC_FIELDS,
      type,
    }),
  );
  setupCardDatasetWithReferencedEntities(
    createMockFailedReferencedEntitiesResults({ error_type: "too-many-rows" }),
  );

  return setup();
}

function setupEntityPicker(searchResults: SearchResult[]) {
  mockGetBoundingClientRect();
  setupSearchEndpoints(searchResults);
  setupRecentViewsAndSelectionsEndpoints([]);
}

async function pickEntity(name: string) {
  await userEvent.click(
    await screen.findByRole("menuitem", {
      name: /Value from another question/,
    }),
  );
  await userEvent.click(await screen.findByText(name));
}

function getEntityPickerBackItem() {
  return within(screen.getByTestId("mini-picker")).getByRole("menuitem", {
    name: /Value from another question/,
  });
}

async function openMenu() {
  await userEvent.click(
    screen.getByRole("button", { name: "Pick a dynamic value" }),
  );
}

async function openMenuWithKeyboard() {
  await userEvent.click(screen.getByRole("textbox", { name: "Min" }));
  await userEvent.tab();
  const trigger = screen.getByRole("button", { name: "Pick a dynamic value" });
  expect(trigger).toHaveFocus();
  await userEvent.keyboard("{Enter}");
  await screen.findByRole("menu");
  await waitFor(() => expect(trigger).not.toHaveFocus());
}

function ControlledGoalValueInput() {
  const [value, setValue] = useState<GoalValue | null>("sum");

  return (
    <GoalValueInput
      aria-label="Min"
      data={DATA}
      datasetQuery={DATASET_QUERY}
      display="progress"
      id="goal-value"
      referencedEntities={[]}
      value={value}
      onChange={setValue}
    />
  );
}
