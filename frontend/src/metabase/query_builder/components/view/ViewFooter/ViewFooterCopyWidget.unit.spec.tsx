import userEvent from "@testing-library/user-event";

import { act, renderWithProviders, screen, waitFor } from "__support__/ui";
import * as SaveChartImage from "metabase/visualizations/lib/save-chart-image";
import { registerVisualizations } from "metabase/visualizations/register";
import type { Card, Dataset } from "metabase-types/api";
import { createMockColumn, createMockDataset } from "metabase-types/api/mocks";

import { queryErrored } from "../../../actions/querying";

import { ViewFooterCopyWidget } from "./ViewFooterCopyWidget";
import {
  ALL_HIDDEN_OBJECT_CARD,
  ALL_HIDDEN_TABLE_CARD,
  CLASSIC_PIVOT_CARD,
  CLASSIC_PIVOT_RESULT,
  DETAILS_TABLE_RESULT,
  LINE_CARD,
  OBJECT_CARD,
  OBJECT_CARD_WITH_HIDDEN_COLUMN,
  PIVOT_CARD,
  PIVOT_RESULT,
  SCALAR_CARD,
  TABLE_CARD,
  TABLE_RESULT,
  createSparseAggregateResult,
  createSparseClassicPivotResult,
  createSparsePivotResult,
  createViewFooterState,
} from "./test-utils";

jest.mock("metabase/visualizations/lib/save-chart-image", () => ({
  ...jest.requireActual<typeof SaveChartImage>(
    "metabase/visualizations/lib/save-chart-image",
  ),
  getChartImageBlob: jest.fn(),
}));

registerVisualizations();

// One shared row instance keeps the over-limit fixture cheap to build
const WIDE_ROW = Array.from({ length: 501 }, () => 1);

const ORIGINAL_CLIPBOARD = navigator.clipboard;
const ORIGINAL_CLIPBOARD_ITEM = window.ClipboardItem;

afterEach(() => {
  jest.mocked(SaveChartImage.getChartImageBlob).mockReset();
  Object.assign(navigator, { clipboard: ORIGINAL_CLIPBOARD });
  Object.assign(window, { ClipboardItem: ORIGINAL_CLIPBOARD_ITEM });
});

// jsdom has no ClipboardItem; a stub that keeps its input is enough
class FakeClipboardItem {
  constructor(readonly parts: Record<string, Blob | Promise<Blob>>) {}
}

// jsdom's Blob has no .text()
const readBlob = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });

const mockClipboardWrite = () => {
  Object.assign(window, { ClipboardItem: FakeClipboardItem });
  const write = jest.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { write } });
  return write;
};

const mockClipboardWriteText = () => {
  Reflect.deleteProperty(window, "ClipboardItem");
  const writeText = jest.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });
  return writeText;
};

interface SetupOpts {
  card: Card;
  result: Dataset;
  lastRunCard?: Card;
  isRunning?: boolean;
  isShowingRawTable?: boolean;
  pivotedExportsEnabled?: boolean;
  whitelabeled?: boolean;
}

const setup = (opts: SetupOpts) =>
  renderWithProviders(<ViewFooterCopyWidget />, {
    storeInitialState: createViewFooterState(opts),
  });

describe("ViewFooterCopyWidget", () => {
  it("copies text and html table flavors so spreadsheets paste a grid", async () => {
    const write = mockClipboardWrite();
    setup({ card: TABLE_CARD, result: TABLE_RESULT });

    await userEvent.click(
      screen.getByLabelText("Copy these results to clipboard"),
    );

    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    const item: FakeClipboardItem = write.mock.calls[0][0][0];
    expect(await readBlob(await item.parts["text/plain"])).toBe(
      "Name\tTotal\nWidget\t10.5",
    );
    expect(await readBlob(await item.parts["text/html"])).toBe(
      "<table><tbody><tr><td>Name</td><td>Total</td></tr><tr><td>Widget</td><td>10.5</td></tr></tbody></table>",
    );
  });

  it("copies the rendered grid for pivot tables", async () => {
    const writeText = mockClipboardWriteText();
    setup({ card: PIVOT_CARD, result: PIVOT_RESULT });

    await userEvent.click(
      screen.getByLabelText("Copy these results to clipboard"),
    );

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        ["Category\tAlpha\tBeta", "Doohickey\t10\t20"].join("\n"),
      ),
    );
  });

  it("copies the flat table when the raw data view is shown", async () => {
    const writeText = mockClipboardWriteText();
    setup({ card: PIVOT_CARD, result: PIVOT_RESULT, isShowingRawTable: true });

    await userEvent.click(
      screen.getByLabelText("Copy these results to clipboard"),
    );

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        [
          "Category\tVendor\tCount",
          "Doohickey\tAlpha\t10",
          "Doohickey\tBeta\t20",
        ].join("\n"),
      ),
    );
  });

  it("copies results, not a chart, when a chart is toggled to the raw data view", async () => {
    const writeText = mockClipboardWriteText();
    setup({ card: LINE_CARD, result: TABLE_RESULT, isShowingRawTable: true });

    await userEvent.click(
      screen.getByLabelText("Copy these results to clipboard"),
    );

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith("Name\tTotal\nWidget\t10.5"),
    );
  });

  it("copies a png of the chart for chart views", async () => {
    const write = mockClipboardWrite();
    jest
      .mocked(SaveChartImage.getChartImageBlob)
      .mockResolvedValue(new Blob(["png-bytes"], { type: "image/png" }));
    setup({ card: LINE_CARD, result: TABLE_RESULT });

    await userEvent.click(
      screen.getByLabelText("Copy this chart to clipboard"),
    );

    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    const item: FakeClipboardItem = write.mock.calls[0][0][0];
    expect(await readBlob(await item.parts["image/png"])).toBe("png-bytes");
    expect(SaveChartImage.getChartImageBlob).toHaveBeenCalledWith(
      expect.objectContaining({ includeBranding: true }),
    );
  });

  it("suppresses the chart branding when the instance is whitelabeled", async () => {
    const write = mockClipboardWrite();
    jest
      .mocked(SaveChartImage.getChartImageBlob)
      .mockResolvedValue(new Blob(["png-bytes"], { type: "image/png" }));
    setup({ card: LINE_CARD, result: TABLE_RESULT, whitelabeled: true });

    await userEvent.click(
      screen.getByLabelText("Copy this chart to clipboard"),
    );

    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    const item: FakeClipboardItem = write.mock.calls[0][0][0];
    expect(await readBlob(await item.parts["image/png"])).toBe("png-bytes");
    expect(SaveChartImage.getChartImageBlob).toHaveBeenCalledWith(
      expect.objectContaining({ includeBranding: false }),
    );
  });

  it("copies a pivot flat when pivoted exports are disabled", async () => {
    const writeText = mockClipboardWriteText();
    setup({
      card: PIVOT_CARD,
      result: PIVOT_RESULT,
      pivotedExportsEnabled: false,
    });

    await userEvent.click(
      screen.getByLabelText("Copy these results to clipboard"),
    );

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        [
          "Category\tVendor\tCount",
          "Doohickey\tAlpha\t10",
          "Doohickey\tBeta\t20",
        ].join("\n"),
      ),
    );
  });

  it.each([
    ["table", TABLE_CARD, "Name\tTotal\nWidget\t10.5"],
    ["scalar", SCALAR_CARD, "Name\tTotal\nWidget\t10.5"],
    ["object", OBJECT_CARD, "Name\tTotal\tRaw JSON\nWidget\t10.5\t{}"],
  ])(
    "copies details-only fields only for the %s views that render them",
    async (_display, card, expected) => {
      const writeText = mockClipboardWriteText();
      setup({ card, result: DETAILS_TABLE_RESULT });

      await userEvent.click(
        screen.getByLabelText("Copy these results to clipboard"),
      );

      await waitFor(() => expect(writeText).toHaveBeenCalledWith(expected));
    },
  );

  it("skips columns hidden in the object detail view", async () => {
    const writeText = mockClipboardWriteText();

    setup({
      card: OBJECT_CARD_WITH_HIDDEN_COLUMN,
      result: DETAILS_TABLE_RESULT,
    });

    await userEvent.click(
      screen.getByLabelText("Copy these results to clipboard"),
    );

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith("Total\tRaw JSON\n10.5\t{}"),
    );
  });

  it("disables copy when every object detail column is hidden", async () => {
    const writeText = mockClipboardWriteText();

    setup({ card: ALL_HIDDEN_OBJECT_CARD, result: DETAILS_TABLE_RESULT });

    const button = screen.getByLabelText("Copy these results to clipboard");
    expect(button).toHaveAttribute("data-disabled", "true");
    await userEvent.hover(button);
    expect(
      await screen.findByText(
        "All columns are hidden, so there's nothing to copy",
      ),
    ).toBeInTheDocument();
    await userEvent.click(button);
    expect(writeText).not.toHaveBeenCalled();
  });

  it("disables copy for a pivot the renderer rejected as truncated", async () => {
    const writeText = mockClipboardWriteText();
    const truncated = createMockDataset({
      data: { ...PIVOT_RESULT.data, pivot_rows_truncated: 1000 },
    });

    setup({ card: PIVOT_CARD, result: truncated });

    const button = screen.getByLabelText("Copy these results to clipboard");
    expect(button).toHaveAttribute("data-disabled", "true");
    await userEvent.hover(button);
    expect(
      await screen.findByText(
        "This pivot table is truncated and can't be copied",
      ),
    ).toBeInTheDocument();
    await userEvent.click(button);
    expect(writeText).not.toHaveBeenCalled();
  });

  it("disables copy for a truncated pivot even when pivoted exports are off", async () => {
    const writeText = mockClipboardWriteText();
    const truncated = createMockDataset({
      data: { ...PIVOT_RESULT.data, pivot_rows_truncated: 1000 },
    });

    setup({
      card: PIVOT_CARD,
      result: truncated,
      pivotedExportsEnabled: false,
    });

    const button = screen.getByLabelText("Copy these results to clipboard");
    expect(button).toHaveAttribute("data-disabled", "true");
    await userEvent.hover(button);
    expect(
      await screen.findByText(
        "This pivot table is truncated and can't be copied",
      ),
    ).toBeInTheDocument();
    await userEvent.click(button);
    expect(writeText).not.toHaveBeenCalled();
  });

  it.each([[false], [true]])(
    "disables copy for a pivot result with only total rows (raw view: %s)",
    async (isShowingRawTable) => {
      const writeText = mockClipboardWriteText();
      const totalsOnly = createMockDataset({
        data: {
          ...PIVOT_RESULT.data,
          rows: [[null, null, 0, 3]],
        },
      });

      setup({ card: PIVOT_CARD, result: totalsOnly, isShowingRawTable });

      const button = screen.getByLabelText("Copy these results to clipboard");
      expect(button).toHaveAttribute("data-disabled", "true");
      await userEvent.hover(button);
      expect(
        await screen.findByText("There are no results to copy"),
      ).toBeInTheDocument();
      await userEvent.click(button);
      expect(writeText).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["pivot", PIVOT_CARD, createSparsePivotResult(2000)],
    ["classic pivot", CLASSIC_PIVOT_CARD, createSparseClassicPivotResult(2000)],
  ])(
    "disables copy for a sparse %s whose grid would be too large",
    async (_desc, card, result) => {
      const writeText = mockClipboardWriteText();

      setup({ card, result });

      const button = screen.getByLabelText("Copy these results to clipboard");
      expect(button).toHaveAttribute("data-disabled", "true");
      await userEvent.hover(button);
      expect(
        await screen.findByText("These results are too large to copy"),
      ).toBeInTheDocument();
      await userEvent.click(button);
      expect(writeText).not.toHaveBeenCalled();
    },
  );

  it("keeps copy enabled for an ordinary table with a column named pivot-grouping", async () => {
    const writeText = mockClipboardWriteText();
    const result = createMockDataset({
      data: {
        cols: [
          createMockColumn({
            name: "pivot-grouping",
            display_name: "pivot-grouping",
            base_type: "type/Integer",
          }),
        ],
        rows: [[1], [2]],
      },
    });

    setup({ card: TABLE_CARD, result });

    const button = screen.getByLabelText("Copy these results to clipboard");
    expect(button).not.toHaveAttribute("data-disabled");
    await userEvent.click(button);

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith("pivot-grouping\n1\n2"),
    );
  });

  it("keeps copy enabled for a high-cardinality aggregate that renders flat", async () => {
    const writeText = mockClipboardWriteText();

    setup({ card: TABLE_CARD, result: createSparseAggregateResult(2000) });

    const button = screen.getByLabelText("Copy these results to clipboard");
    expect(button).not.toHaveAttribute("data-disabled");
    await userEvent.click(button);

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0][0].split("\n")).toHaveLength(2001);
  });

  it("disables copy for a flat table with more cells than the copy limit", async () => {
    const writeText = mockClipboardWriteText();
    const wide = createMockDataset({
      data: {
        cols: Array.from({ length: 501 }, (_, index) =>
          createMockColumn({
            name: `WIDE_${index}`,
            display_name: `Wide ${index}`,
            base_type: "type/Integer",
          }),
        ),
        rows: Array.from({ length: 2000 }, () => WIDE_ROW),
      },
    });

    setup({ card: TABLE_CARD, result: wide });

    const button = screen.getByLabelText("Copy these results to clipboard");
    expect(button).toHaveAttribute("data-disabled", "true");
    await userEvent.hover(button);
    expect(
      await screen.findByText("These results are too large to copy"),
    ).toBeInTheDocument();
    await userEvent.click(button);
    expect(writeText).not.toHaveBeenCalled();
  });

  it("shows the too-large toast when serialized text passes the size limit", async () => {
    const writeText = mockClipboardWriteText();
    const huge = createMockDataset({
      data: {
        ...TABLE_RESULT.data,
        rows: [["x".repeat(21_000_000), 1]],
      },
    });

    const { store } = setup({ card: TABLE_CARD, result: huge });

    await userEvent.click(
      screen.getByLabelText("Copy these results to clipboard"),
    );

    await waitFor(() => {
      expect(store.getState().undo).toContainEqual(
        expect.objectContaining({
          message: "These results are too large to copy",
        }),
      );
    });
    expect(writeText).not.toHaveBeenCalled();
  });

  it("disables chart copy when there are no results to render", async () => {
    mockClipboardWrite();
    const empty = createMockDataset({
      data: { ...TABLE_RESULT.data, rows: [] },
    });

    setup({ card: LINE_CARD, result: empty });

    const button = screen.getByLabelText("Copy this chart to clipboard");
    expect(button).toHaveAttribute("data-disabled", "true");
    await userEvent.hover(button);
    expect(
      await screen.findByText("There are no results to copy"),
    ).toBeInTheDocument();
    await userEvent.click(button);
    expect(SaveChartImage.getChartImageBlob).not.toHaveBeenCalled();
  });

  it("disables chart copy when the browser cannot write image clipboard items", async () => {
    mockClipboardWriteText();

    setup({ card: LINE_CARD, result: TABLE_RESULT });

    const button = screen.getByLabelText("Copy this chart to clipboard");
    expect(button).toHaveAttribute("data-disabled", "true");
    await userEvent.hover(button);
    expect(
      await screen.findByText("Copying isn't supported in this browser"),
    ).toBeInTheDocument();
    await userEvent.click(button);
    expect(SaveChartImage.getChartImageBlob).not.toHaveBeenCalled();
  });

  it("disables results copy when the browser exposes no clipboard API", async () => {
    Reflect.deleteProperty(window, "ClipboardItem");
    Object.assign(navigator, { clipboard: undefined });

    setup({ card: TABLE_CARD, result: TABLE_RESULT });

    const button = screen.getByLabelText("Copy these results to clipboard");
    expect(button).toHaveAttribute("data-disabled", "true");
    await userEvent.hover(button);
    expect(
      await screen.findByText("Copying isn't supported in this browser"),
    ).toBeInTheDocument();
  });

  it("disables copy for a table with every column hidden", async () => {
    const writeText = mockClipboardWriteText();

    setup({ card: ALL_HIDDEN_TABLE_CARD, result: TABLE_RESULT });

    const button = screen.getByLabelText("Copy these results to clipboard");
    expect(button).toHaveAttribute("data-disabled", "true");
    await userEvent.hover(button);
    expect(
      await screen.findByText(
        "All columns are hidden, so there's nothing to copy",
      ),
    ).toBeInTheDocument();
    await userEvent.click(button);
    expect(writeText).not.toHaveBeenCalled();
  });

  it("disables copy while a rerun is pending", async () => {
    const writeText = mockClipboardWriteText();

    setup({ card: TABLE_CARD, result: TABLE_RESULT, isRunning: true });

    const button = screen.getByLabelText("Copy these results to clipboard");
    expect(button).toHaveAttribute("data-disabled", "true");
    await userEvent.hover(button);
    expect(
      await screen.findByText("Results are still loading"),
    ).toBeInTheDocument();
    await userEvent.click(button);
    expect(writeText).not.toHaveBeenCalled();
  });

  it.each([
    [
      "a pivot result behind a table view",
      TABLE_CARD,
      PIVOT_CARD,
      PIVOT_RESULT,
    ],
    [
      "a table result behind a pivot view",
      PIVOT_CARD,
      TABLE_CARD,
      TABLE_RESULT,
    ],
  ])(
    "disables copy when a cancelled rerun leaves %s",
    async (_desc, card, lastRunCard, result) => {
      const writeText = mockClipboardWriteText();

      const { store } = setup({ card, result, lastRunCard, isRunning: true });
      await act(async () => {
        await store.dispatch(
          queryErrored(
            Date.now(),
            new DOMException("The operation was aborted.", "AbortError"),
          ),
        );
      });

      expect(store.getState().qb.lastRunCard).toEqual(lastRunCard);
      expect(store.getState().qb.queryResults).toEqual([result]);
      const button = screen.getByLabelText("Copy these results to clipboard");
      expect(button).toHaveAttribute("data-disabled", "true");
      await userEvent.hover(button);
      expect(
        await screen.findByText("Rerun the query to copy its results"),
      ).toBeInTheDocument();
      await userEvent.click(button);
      expect(writeText).not.toHaveBeenCalled();
    },
  );

  it("says the raw view of a truncated pivot copied only the first rows", async () => {
    const writeText = mockClipboardWriteText();
    const truncated = createMockDataset({
      data: { ...PIVOT_RESULT.data, pivot_rows_truncated: 1000 },
    });

    const { store } = setup({
      card: PIVOT_CARD,
      result: truncated,
      isShowingRawTable: true,
    });

    await userEvent.click(
      screen.getByLabelText("Copy these results to clipboard"),
    );

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        [
          "Category\tVendor\tCount",
          "Doohickey\tAlpha\t10",
          "Doohickey\tBeta\t20",
        ].join("\n"),
      ),
    );
    await waitFor(() => {
      expect(store.getState().undo).toContainEqual(
        expect.objectContaining({
          message: "First 2 rows copied to clipboard",
        }),
      );
    });
  });

  it("starts the chart clipboard write before the image is rendered", async () => {
    const write = mockClipboardWrite();
    jest
      .mocked(SaveChartImage.getChartImageBlob)
      .mockReturnValue(new Promise(() => {}));

    setup({ card: LINE_CARD, result: TABLE_RESULT });

    await userEvent.click(
      screen.getByLabelText("Copy this chart to clipboard"),
    );

    expect(write).toHaveBeenCalledTimes(1);
  });

  it("shows an error toast when the clipboard write fails", async () => {
    Reflect.deleteProperty(window, "ClipboardItem");
    const writeText = jest.fn().mockRejectedValue(new Error("denied"));
    Object.assign(navigator, { clipboard: { writeText } });

    const { store } = setup({ card: TABLE_CARD, result: TABLE_RESULT });

    await userEvent.click(
      screen.getByLabelText("Copy these results to clipboard"),
    );

    await waitFor(() => {
      expect(store.getState().undo).toContainEqual(
        expect.objectContaining({
          message: "Couldn't copy to clipboard",
        }),
      );
    });
  });

  it("says when only the first rows were copied", async () => {
    mockClipboardWriteText();
    const truncated = createMockDataset({
      data: { ...TABLE_RESULT.data, rows_truncated: 2000 },
    });

    const { store } = setup({ card: TABLE_CARD, result: truncated });

    await userEvent.click(
      screen.getByLabelText("Copy these results to clipboard"),
    );

    await waitFor(() => {
      expect(store.getState().undo).toContainEqual(
        expect.objectContaining({
          message: "First 1 row copied to clipboard",
        }),
      );
    });
  });

  it("says the pivot was computed from a truncated result", async () => {
    mockClipboardWriteText();
    const truncated = createMockDataset({
      data: { ...CLASSIC_PIVOT_RESULT.data, rows_truncated: 2000 },
    });

    const { store } = setup({ card: CLASSIC_PIVOT_CARD, result: truncated });

    await userEvent.click(
      screen.getByLabelText("Copy these results to clipboard"),
    );

    await waitFor(() => {
      expect(store.getState().undo).toContainEqual(
        expect.objectContaining({
          message:
            "Pivot table copied to clipboard, based on the first 2,000 rows of the result",
        }),
      );
    });
  });
});
