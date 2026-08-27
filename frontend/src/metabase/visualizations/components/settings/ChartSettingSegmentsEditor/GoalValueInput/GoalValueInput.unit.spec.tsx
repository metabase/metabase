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
import { checkNotNull } from "metabase/utils/types";
import type {
  DatasetData,
  GoalValue,
  ReferencedEntitiesResults,
  ReferencedEntity,
  SearchResult,
} from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
  createMockField,
  createMockMeasure,
  createMockSearchResult,
  createMockStructuredDatasetQuery,
} from "metabase-types/api/mocks";

import { SegmentBoundInput } from "../SegmentBoundInput";

import { GoalValueInput } from "./GoalValueInput";

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

type SetupOpts = {
  data?: DatasetData;
  referencedEntities?: ReferencedEntity[];
  value?: GoalValue | null;
};

function setup({
  data = DATA,
  referencedEntities = [],
  value = 0,
}: SetupOpts = {}) {
  const onChange = jest.fn();
  renderWithProviders(
    <GoalValueInput
      aria-label="Min"
      data={data}
      datasetQuery={DATASET_QUERY}
      id="goal-value"
      referencedEntities={referencedEntities}
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

    const pill = screen.getByRole("button", { name: "Change value source" });
    expect(within(pill).getByText("250")).toBeInTheDocument();
  });

  it("resolves a reference the dataset can't answer by re-running the query with it attached", async () => {
    setupCardEndpoints(createMockCard({ id: 9, name: "Orders" }));
    setupCardDatasetWithReferencedEntities({
      card: {
        9: {
          status: "completed",
          data: {
            cols: [createMockColumn({ name: "total" })],
            rows: [[250]],
          },
        },
      },
    });
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
    renderWithProviders(
      <SegmentBoundInput
        aria-label="Min"
        data={DATA}
        datasetQuery={DATASET_QUERY}
        id="goal-value"
        placeholder="Min"
        referencedEntities={[{ type: "card", id: 9 }]}
        value={{ type: "card", id: 9, column: "total" }}
        onChange={jest.fn()}
      />,
    );

    expect(
      await screen.findByText("Couldn't load this value"),
    ).toBeInTheDocument();
  });

  it("shows an empty pill and an error for a referenced column that no longer exists", async () => {
    setupCardEndpoints(createMockCard({ id: 9, name: "Orders" }));
    setupCardDatasetWithReferencedEntities({
      card: {
        9: {
          status: "completed",
          data: {
            cols: [createMockColumn({ name: "total" })],
            rows: [[250]],
          },
        },
      },
    });
    renderWithProviders(
      <SegmentBoundInput
        aria-label="Min"
        data={createMockDatasetData({
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
        })}
        datasetQuery={DATASET_QUERY}
        id="goal-value"
        placeholder="Min"
        referencedEntities={[{ type: "card", id: 9 }]}
        value={{ type: "card", id: 9, column: "avg" }}
        onChange={jest.fn()}
      />,
    );

    expect(
      await screen.findByText("This column no longer exists"),
    ).toBeInTheDocument();

    const pill = screen.getByRole("button", { name: "Change value source" });
    expect(within(pill).getByText("—")).toBeInTheDocument();
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
    const Harness = () => {
      const [value, setValue] = useState<GoalValue | null>("sum");
      return (
        <GoalValueInput
          aria-label="Min"
          data={DATA}
          datasetQuery={DATASET_QUERY}
          id="goal-value"
          referencedEntities={[]}
          value={value}
          onChange={setValue}
        />
      );
    };
    renderWithProviders(<Harness />);

    const pill = screen.getByRole("group", { name: "Min" });
    fireEvent.keyDown(pill, { key: "Backspace" });

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

  it("opens the root menu when clicking the pill of a single-column source", async () => {
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

  it("searches questions and metrics, but not models, when the instance has no measures", async () => {
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
    expect(url.searchParams.getAll("models")).toEqual(["card", "metric"]);
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

    await userEvent.click(
      screen.getByRole("button", { name: "Change value source" }),
    );

    const item = await screen.findByRole("menuitem", { name: /Average/ });
    expect(await within(item).findByText("12")).toBeInTheDocument();
    expect(
      within(screen.getByRole("menuitem", { name: /Total/ })).getByText("250"),
    ).toBeInTheDocument();
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

async function openMenu() {
  await userEvent.click(
    screen.getByRole("button", { name: "Pick a dynamic value" }),
  );
}
