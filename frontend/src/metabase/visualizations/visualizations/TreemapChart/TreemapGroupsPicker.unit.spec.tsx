import userEvent from "@testing-library/user-event";

import { render, screen, within } from "__support__/ui";
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
          createMockNumericColumn({ id: 2, name: "Amount" }),
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
    hidden: false,
    ...overrides,
  };
}

function setup(treemapRows: TreemapRow[]) {
  const onChangeSettings = jest.fn();
  const onShowWidget = jest.fn();

  render(
    <TreemapGroupsPicker
      rawSeries={rawSeries}
      settings={{ "treemap.rows": treemapRows }}
      onChangeSettings={onChangeSettings}
      onShowWidget={onShowWidget}
    />,
  );

  return { onChangeSettings, onShowWidget };
}

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

  it("renders no hide buttons (no removing groups)", () => {
    setup([
      makeRow({ key: "Phones", name: "Phones" }),
      makeRow({ key: "Laptops", name: "Laptops" }),
    ]);

    expect(screen.queryByTestId("Phones-hide-button")).not.toBeInTheDocument();
    expect(screen.queryByTestId("Laptops-hide-button")).not.toBeInTheDocument();
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

  it("changes a group color and marks it as non-default", async () => {
    const { onChangeSettings } = setup([
      makeRow({ key: "Phones", color: "#509EE3", defaultColor: true }),
    ]);

    await userEvent.click(screen.getByTestId("color-selector-button"));
    const popover = await screen.findByTestId("color-selector-popover");
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
