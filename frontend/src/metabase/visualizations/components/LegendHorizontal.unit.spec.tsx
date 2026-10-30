import userEvent from "@testing-library/user-event";

import { createMockDOMRect, render, screen } from "__support__/ui";

import { LegendHorizontal } from "./LegendHorizontal";

const ITEM_WIDTH = 100;
const SHORT_ITEM_WIDTH = 50;
const ROW_HEIGHT = 20;
const TITLES = ["Widget", "Gadget", "Gizmo", "Doohickey", "Thingamajig"];
const SHORT_TITLES = ["A", "B", "C", "D", "E"];
const COLORS = ["red", "green", "blue", "yellow", "purple"];

interface RowLayoutOpts {
  rowWidth: number;
  titles?: string[];
  itemWidth?: number;
}

// lays the list items side by side, itemWidth each, in a list rowWidth wide
const mockRowLayout = ({
  rowWidth,
  titles = TITLES,
  itemWidth = ITEM_WIDTH,
}: RowLayoutOpts) => {
  jest
    .spyOn(window.Element.prototype, "getBoundingClientRect")
    .mockImplementation(function (this: Element) {
      const itemIndex = titles.findIndex(
        (title) => this.getAttribute("data-testid") === `legend-item-${title}`,
      );
      if (itemIndex >= 0) {
        const left = itemIndex * itemWidth;
        return createMockDOMRect({
          left,
          right: left + itemWidth,
          width: itemWidth,
          bottom: ROW_HEIGHT,
          height: ROW_HEIGHT,
        });
      }
      return createMockDOMRect({
        right: rowWidth,
        width: rowWidth,
        bottom: ROW_HEIGHT,
        height: ROW_HEIGHT,
      });
    });
};

interface SetupOpts {
  rowWidth: number;
  isSingleRow?: boolean;
}

const setup = ({ rowWidth, isSingleRow }: SetupOpts) => {
  mockRowLayout({ rowWidth });
  const { rerender } = render(
    <LegendHorizontal
      titles={TITLES}
      colors={COLORS}
      isSingleRow={isSingleRow}
    />,
  );
  const rerenderWithTitles = (titles: string[]) =>
    rerender(
      <LegendHorizontal
        titles={titles}
        colors={COLORS.slice(0, titles.length)}
        isSingleRow={isSingleRow}
      />,
    );
  return { rerenderWithTitles };
};

describe("LegendHorizontal", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should render every title when the rows may wrap", () => {
    setup({ rowWidth: 250 });

    TITLES.forEach((title) =>
      expect(screen.getByText(title)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/more/)).not.toBeInTheDocument();
  });

  it("should render every title in a single row when they fit", () => {
    setup({ rowWidth: 500, isSingleRow: true });

    TITLES.forEach((title) =>
      expect(screen.getByText(title)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/more/)).not.toBeInTheDocument();
  });

  it("should fold the titles that do not fit a single row into a '+ N more' popover", async () => {
    // 3 items fit in 300px, one more folds to make room for "+ 3 more"
    setup({ rowWidth: 300, isSingleRow: true });

    expect(screen.getByText("Widget")).toBeInTheDocument();
    expect(screen.getByText("Gadget")).toBeInTheDocument();
    expect(screen.queryByText("Gizmo")).not.toBeInTheDocument();

    await userEvent.click(screen.getByText("+ 3 more"));

    expect(await screen.findByText("Gizmo")).toBeInTheDocument();
    expect(screen.getByText("Doohickey")).toBeInTheDocument();
    expect(screen.getByText("Thingamajig")).toBeInTheDocument();
  });

  it("should keep the first title visible when no title fits", () => {
    setup({ rowWidth: 50, isSingleRow: true });

    expect(screen.getByText("Widget")).toBeInTheDocument();
    expect(screen.queryByText("Gadget")).not.toBeInTheDocument();
    expect(screen.getByText("+ 4 more")).toBeInTheDocument();
  });

  it("should measure again when fewer titles arrive in a row of the same width", () => {
    const { rerenderWithTitles } = setup({
      rowWidth: 300,
      isSingleRow: true,
    });
    expect(screen.getByText("+ 3 more")).toBeInTheDocument();

    rerenderWithTitles(TITLES.slice(0, 3));

    expect(screen.getByText("Widget")).toBeInTheDocument();
    expect(screen.getByText("Gadget")).toBeInTheDocument();
    expect(screen.getByText("Gizmo")).toBeInTheDocument();
    expect(screen.queryByText(/more/)).not.toBeInTheDocument();
  });

  it("should measure again when as many different titles arrive in a row of the same width", () => {
    const { rerenderWithTitles } = setup({
      rowWidth: 300,
      isSingleRow: true,
    });
    expect(screen.getByText("+ 3 more")).toBeInTheDocument();

    mockRowLayout({
      rowWidth: 300,
      titles: SHORT_TITLES,
      itemWidth: SHORT_ITEM_WIDTH,
    });
    rerenderWithTitles(SHORT_TITLES);

    SHORT_TITLES.forEach((title) =>
      expect(screen.getByText(title)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/more/)).not.toBeInTheDocument();
  });
});
