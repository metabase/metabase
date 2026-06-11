import userEvent from "@testing-library/user-event";

import { render, screen, within } from "__support__/ui";
import { getAccentColors } from "metabase/ui/colors/groups";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { TreemapRow } from "metabase-types/api";
import {
  createMockCategoryColumn,
  createMockNumericColumn,
  createMockSingleSeries,
} from "metabase-types/api/mocks";

import { TreemapGroupsPicker } from "./TreemapGroupsPicker";

const rawSeries = [
  createMockSingleSeries(
    { id: 1, name: "Test Card", display: "treemap" },
    {
      data: {
        cols: [
          createMockCategoryColumn({ id: 1, name: "Category" }),
          createMockCategoryColumn({ id: 2, name: "SubCategory" }),
          createMockNumericColumn({ id: 3, name: "Amount" }),
        ],
        rows: [],
      },
    },
  ),
];

function makeRow(overrides: Partial<TreemapRow> = {}): TreemapRow {
  return {
    key: "Phones",
    name: "Phones",
    originalName: "Phones",
    color: "#509EE3",
    defaultColor: true,
    enabled: true,
    hidden: false,
    ...overrides,
  };
}

function setup(
  treemapRows: TreemapRow[],
  settings: ComputedVisualizationSettings = {},
) {
  const onChangeSettings = jest.fn();
  const onShowWidget = jest.fn();

  render(
    <TreemapGroupsPicker
      rawSeries={rawSeries}
      settings={{ "treemap.rows": treemapRows, ...settings }}
      onChangeSettings={onChangeSettings}
      onShowWidget={onShowWidget}
    />,
  );

  return { onChangeSettings, onShowWidget };
}

const twoLevelSettings: ComputedVisualizationSettings = {
  "treemap.grouping": "Category",
  "treemap.sub_grouping": "SubCategory",
  "treemap.value": "Amount",
};

describe("TreemapGroupsPicker", () => {
  it("renders one row per group", () => {
    setup([
      makeRow({ key: "Phones", name: "Phones" }),
      makeRow({ key: "Laptops", name: "Laptops" }),
    ]);

    expect(screen.getByText("Phones")).toBeInTheDocument();
    expect(screen.getByText("Laptops")).toBeInTheDocument();
  });

  it("renders nothing when there are no rows", () => {
    setup([]);

    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("does not render rows for keys no longer in the data (hidden)", () => {
    setup([
      makeRow({ key: "Phones", name: "Phones" }),
      makeRow({ key: "Discontinued", name: "Discontinued", hidden: true }),
    ]);

    expect(screen.getByText("Phones")).toBeInTheDocument();
    expect(screen.queryByText("Discontinued")).not.toBeInTheDocument();
  });

  it("renders no drag handles (no reordering)", () => {
    setup([
      makeRow({ key: "Phones", name: "Phones" }),
      makeRow({ key: "Laptops", name: "Laptops" }),
    ]);

    expect(screen.queryByTestId("drag-handle")).not.toBeInTheDocument();
  });

  it("removes a group from the chart via the X", async () => {
    const { onChangeSettings } = setup([
      makeRow({ key: "Phones", name: "Phones" }),
      makeRow({ key: "Laptops", name: "Laptops" }),
    ]);

    await userEvent.click(screen.getByTestId("Phones-hide-button"));

    expect(onChangeSettings).toHaveBeenCalledWith({
      "treemap.rows": [
        expect.objectContaining({ key: "Phones", enabled: false }),
        expect.objectContaining({ key: "Laptops", enabled: true }),
      ],
    });
  });

  it("does not offer the X for the last remaining group", () => {
    setup([makeRow({ key: "Phones", name: "Phones" })]);

    expect(screen.queryByTestId("Phones-hide-button")).not.toBeInTheDocument();
  });

  it("lists a removed group in the add-back picker instead of the rows", async () => {
    const { onChangeSettings } = setup([
      makeRow({ key: "Phones", name: "Phones" }),
      makeRow({ key: "Laptops", name: "Laptops", enabled: false }),
    ]);

    expect(screen.queryByText("Laptops")).not.toBeInTheDocument();

    await userEvent.click(screen.getByText("Add another group"));
    await userEvent.click(await screen.findByText("Laptops"));

    expect(onChangeSettings).toHaveBeenCalledWith({
      "treemap.rows": [
        expect.objectContaining({ key: "Phones", enabled: true }),
        expect.objectContaining({ key: "Laptops", enabled: true }),
      ],
    });
  });

  it("opens the rename widget for the clicked group", async () => {
    const { onShowWidget } = setup([makeRow({ key: "Phones" })]);

    await userEvent.click(screen.getByTestId("Phones-settings-button"));

    expect(onShowWidget).toHaveBeenCalledWith(
      expect.objectContaining({
        props: { seriesKey: "Phones" },
      }),
      expect.anything(),
    );
  });

  it("offers only the main accent colors when a sub-grouping is set", async () => {
    setup([makeRow({ key: "Phones" })], twoLevelSettings);

    await userEvent.click(screen.getByLabelText("#509EE3"));
    const popover = await screen.findByRole("dialog");

    expect(within(popover).getAllByRole("button")).toHaveLength(
      getAccentColors({
        main: true,
        light: false,
        dark: false,
        harmony: false,
      }).length,
    );
  });

  it("offers the full palette including shades for a 1-level treemap", async () => {
    setup([makeRow({ key: "Phones" })], {
      "treemap.grouping": "Category",
      "treemap.value": "Amount",
    });

    await userEvent.click(screen.getByLabelText("#509EE3"));
    const popover = await screen.findByRole("dialog");

    expect(within(popover).getAllByRole("button")).toHaveLength(
      getAccentColors().length,
    );
  });

  it("changes a group color and marks it as non-default", async () => {
    const { onChangeSettings } = setup([
      makeRow({ key: "Phones", color: "#509EE3", defaultColor: true }),
    ]);

    await userEvent.click(screen.getByLabelText("#509EE3"));
    const popover = await screen.findByRole("dialog");
    const [firstColor] = within(popover).getAllByRole("button");
    await userEvent.click(firstColor);

    expect(onChangeSettings).toHaveBeenCalledWith({
      "treemap.rows": [
        expect.objectContaining({
          key: "Phones",
          defaultColor: false,
          color: expect.stringMatching(/^#/),
        }),
      ],
    });
  });
});
