import type { ContentTranslationFunction } from "metabase/content-translation/types";
import { registerVisualizations } from "metabase/visualizations/register";
import type * as VizCore from "metabase/viz-core";
import { getTableClickedObjectRowData } from "metabase/viz-core";
import type {
  Card,
  DatasetData,
  VisualizationSettings,
} from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks";

import {
  ResultsTooLargeError,
  getResultsClipboardContent,
} from "./results-clipboard";

jest.mock("metabase/viz-core", () => {
  const actual = jest.requireActual<typeof VizCore>("metabase/viz-core");
  return {
    ...actual,
    getTableClickedObjectRowData: jest.fn(actual.getTableClickedObjectRowData),
  };
});

registerVisualizations();

const identity: ContentTranslationFunction = (value) => value;

const NAME = createMockColumn({
  name: "NAME",
  display_name: "Name",
  base_type: "type/Text",
});

const TOTAL = createMockColumn({
  name: "TOTAL",
  display_name: "Total",
  base_type: "type/Float",
});

const CATEGORY = createMockColumn({
  name: "CATEGORY",
  display_name: "Category",
  base_type: "type/Text",
  source: "breakout",
});

const VENDOR = createMockColumn({
  name: "VENDOR",
  display_name: "Vendor",
  base_type: "type/Text",
  source: "breakout",
});

const COUNT = createMockColumn({
  name: "COUNT",
  display_name: "Count",
  base_type: "type/Integer",
  source: "aggregation",
});

const TOTAL_AGG = createMockColumn({
  name: "TOTAL",
  display_name: "Total",
  base_type: "type/Float",
  source: "aggregation",
});

const PIVOT_GROUPING = createMockColumn({
  name: "pivot-grouping",
  display_name: "pivot-grouping",
  base_type: "type/Integer",
});

const tableCard = (visualization_settings: VisualizationSettings = {}) =>
  createMockCard({ display: "table", visualization_settings });

const TEST_DATA = createMockDatasetData({
  cols: [NAME, TOTAL],
  rows: [
    ["Widget", 1234.5],
    ["Gadget", 3],
  ],
});

interface CopyOpts {
  card?: Card;
  data?: DatasetData;
  pivoted?: boolean;
  isPivotResult?: boolean;
  isShowingDetailsOnlyColumns?: boolean;
  translate?: ContentTranslationFunction;
}

const copy = ({
  card = tableCard(),
  data = TEST_DATA,
  pivoted = false,
  isPivotResult = pivoted,
  isShowingDetailsOnlyColumns = false,
  translate = identity,
}: CopyOpts = {}) =>
  getResultsClipboardContent({
    card,
    data,
    pivoted,
    isPivotResult,
    isShowingDetailsOnlyColumns,
    translate,
  });

describe("getResultsClipboardContent", () => {
  it("serializes headers and rows as TSV plus an html grid flavor", () => {
    const { text, html, rowCount, isPivotGrid } = copy();

    expect(isPivotGrid).toBe(false);
    expect(text).toBe("Name\tTotal\nWidget\t1,234.5\nGadget\t3");
    expect(html).toBe(
      "<table><tbody>" +
        "<tr><td>Name</td><td>Total</td></tr>" +
        "<tr><td>Widget</td><td>1,234.5</td></tr>" +
        "<tr><td>Gadget</td><td>3</td></tr>" +
        "</tbody></table>",
    );
    expect(rowCount).toBe(2);
  });

  it("quotes formula-like cells into literals in both flavors, leaving numbers alone", () => {
    const data = createMockDatasetData({
      cols: [NAME, TOTAL],
      rows: [
        ["=1+2", -1234.5],
        ["@cmd", -3],
        ["-2+3", 5],
        ["\n=1+2", 1],
        ["\0=1+2", 2],
        ["＝1+2", 3],
        ["－2+3", 4],
        [`+1${" ".repeat(64)}x`, 6],
      ],
    });

    const { text, html } = copy({ data });

    expect(text).toBe(
      [
        "Name\tTotal",
        "'=1+2\t-1,234.5",
        "'@cmd\t-3",
        "'-2+3\t5",
        `"'\n=1+2"\t1`,
        "'\0=1+2\t2",
        "'＝1+2\t3",
        "'－2+3\t4",
        `'+1${" ".repeat(64)}x\t6`,
      ].join("\n"),
    );
    expect(html).toContain("<td>'=1+2</td><td>-1,234.5</td>");
  });

  it("keeps scientific-notation numbers unquoted whatever their sign", () => {
    const card = tableCard({
      column_settings: { '["name","TOTAL"]': { number_style: "scientific" } },
    });
    const data = createMockDatasetData({
      cols: [NAME, TOTAL],
      rows: [
        ["negative", -0.000000000015],
        ["positive", 0.000000000015],
      ],
    });

    expect(copy({ card, data }).text).toBe(
      ["Name\tTotal", "negative\t-1.5e-11", "positive\t1.5e-11"].join("\n"),
    );
  });

  it("escapes html in the html flavor", () => {
    const data = createMockDatasetData({
      cols: [NAME, TOTAL],
      rows: [["<b>bold & brash</b>", 1]],
    });

    expect(copy({ data }).html).toContain(
      "<td>&lt;b&gt;bold &amp; brash&lt;/b&gt;</td>",
    );
  });

  it("serializes only the header row when there are no rows", () => {
    const { text, rowCount } = copy({
      data: createMockDatasetData({ cols: [NAME, TOTAL], rows: [] }),
    });

    expect(text).toBe("Name\tTotal");
    expect(rowCount).toBe(0);
  });

  it("serializes null cells as empty strings", () => {
    const data = createMockDatasetData({
      cols: [NAME, TOTAL],
      rows: [["Widget", null]],
    });

    expect(copy({ data }).text).toBe("Name\tTotal\nWidget\t");
  });

  it("applies column formatting settings", () => {
    const card = tableCard({
      column_settings: { '["name","TOTAL"]': { number_style: "percent" } },
    });
    const data = createMockDatasetData({
      cols: [NAME, TOTAL],
      rows: [["Widget", 0.5]],
    });

    expect(copy({ card, data }).text).toBe("Name\tTotal\nWidget\t50%");
  });

  it("uses renamed column titles in the header row", () => {
    const card = tableCard({
      column_settings: { '["name","TOTAL"]': { column_title: "Revenue" } },
    });

    expect(copy({ card }).text).toBe(
      "Name\tRevenue\nWidget\t1,234.5\nGadget\t3",
    );
  });

  it("does not copy the row-index pseudo-column", () => {
    const card = tableCard({ "table.row_index": true });

    expect(copy({ card }).text).toBe("Name\tTotal\nWidget\t1,234.5\nGadget\t3");
  });

  it("respects column visibility and order from table.columns settings", () => {
    const card = tableCard({
      "table.columns": [
        { name: "TOTAL", enabled: true },
        { name: "NAME", enabled: false },
      ],
    });

    expect(copy({ card }).text).toBe("Total\n1,234.5\n3");
  });

  it("refuses to copy when every column is hidden", () => {
    const card = tableCard({
      "table.columns": [
        { name: "TOTAL", enabled: false },
        { name: "NAME", enabled: false },
      ],
    });

    expect(() => copy({ card })).toThrow("All columns are hidden");
  });

  it("keeps a real column literally named pivot-grouping on an ordinary table", () => {
    const data = createMockDatasetData({
      cols: [NAME, PIVOT_GROUPING],
      rows: [
        ["a", 1],
        ["b", 0],
        ["c", "text"],
      ],
    });

    expect(copy({ data }).text).toBe(
      ["Name\tpivot-grouping", "a\t1", "b\t0", "c\ttext"].join("\n"),
    );
  });

  it("keeps details-only fields when isShowingDetailsOnlyColumns matches the display", () => {
    const detailsOnlyCol = createMockColumn({
      name: "RAW_JSON",
      display_name: "Raw json",
      base_type: "type/Text",
      visibility_type: "details-only",
    });
    const data = createMockDatasetData({
      cols: [NAME, detailsOnlyCol],
      rows: [["Widget", "{}"]],
    });

    expect(copy({ data, isShowingDetailsOnlyColumns: true }).text).toBe(
      "Name\tRaw json\nWidget\t{}",
    );
    expect(() =>
      copy({
        data: createMockDatasetData({ cols: [detailsOnlyCol], rows: [["{}"]] }),
        isShowingDetailsOnlyColumns: false,
      }),
    ).toThrow("All columns are hidden");
  });

  it("serializes JSON cells as single-line JSON", () => {
    const data = createMockDatasetData({
      cols: [NAME, TOTAL],
      rows: [[{ tags: ["a", "b"] }, 1]],
    });

    expect(copy({ data }).text).toBe('Name\tTotal\n{"tags":["a","b"]}\t1');
  });

  it("preserves newlines like csv exports, quoting the text flavor", () => {
    const data = createMockDatasetData({
      cols: [NAME, TOTAL],
      rows: [["multi\nline", 1]],
    });

    expect(copy({ data }).text).toBe('Name\tTotal\n"multi\nline"\t1');
    expect(copy({ data }).html).toContain("<td>multi<br>line</td>");
  });

  it("renders every line-ending form as a single break in the html flavor", () => {
    const data = createMockDatasetData({
      cols: [NAME, TOTAL],
      rows: [
        ["a\nb", 1],
        ["c\rd", 2],
        ["e\r\nf", 3],
      ],
    });

    const { html } = copy({ data });

    expect(html).toContain("<td>a<br>b</td>");
    expect(html).toContain("<td>c<br>d</td>");
    expect(html).toContain("<td>e<br>f</td>");
  });

  it("refuses to serialize past the clipboard size limit", () => {
    const data = createMockDatasetData({
      cols: [NAME, TOTAL],
      rows: [["x".repeat(21_000_000), 1]],
    });

    expect(() => copy({ data })).toThrow(ResultsTooLargeError);
  });

  it("serializes the pivoted layout when table.pivot is enabled", () => {
    const card = tableCard({
      "table.pivot": true,
      "table.pivot_column": "VENDOR",
      "table.cell_column": "COUNT",
    });
    const data = createMockDatasetData({
      cols: [CATEGORY, VENDOR, COUNT],
      rows: [
        ["Doohickey", "Alpha", 10],
        ["Doohickey", "Beta", 20],
        ["Gizmo", "Alpha", 30],
      ],
    });

    const { text, rowCount, isPivotGrid } = copy({ card, data });

    expect(isPivotGrid).toBe(true);
    expect(text).toBe(
      ["Category\tAlpha\tBeta", "Doohickey\t10\t20", "Gizmo\t30\t"].join("\n"),
    );
    expect(rowCount).toBe(2);
  });

  it("copies remapped columns as displayed, without the helper column", () => {
    const data = createMockDatasetData({
      cols: [
        createMockColumn({
          name: "PRODUCT_ID",
          display_name: "Product ID",
          base_type: "type/Integer",
          remapped_to: "PRODUCT_NAME",
        }),
        createMockColumn({
          name: "PRODUCT_NAME",
          display_name: "Product Name",
          base_type: "type/Text",
          remapped_from: "PRODUCT_ID",
        }),
        TOTAL,
      ],
      rows: [
        [1, "Awesome Bronze Plate", 99.5],
        [2, "Mediocre Wool Toucan", 42],
      ],
    });

    expect(copy({ data }).text).toBe(
      [
        "Product Name\tTotal",
        "Awesome Bronze Plate\t99.5",
        "Mediocre Wool Toucan\t42",
      ].join("\n"),
    );
  });

  it("follows the auto-pivot default for aggregated questions", () => {
    const data = createMockDatasetData({
      cols: [
        CATEGORY,
        createMockColumn({
          name: "QUARTER",
          display_name: "Quarter",
          base_type: "type/Date",
          source: "breakout",
        }),
        createMockColumn({
          name: "COUNT",
          display_name: "Count",
          base_type: "type/Integer",
          semantic_type: "type/Quantity",
          source: "aggregation",
        }),
      ],
      rows: [
        ["Doohickey", "2025-04-01", 15],
        ["Doohickey", "2025-07-01", 51],
        ["Doohickey", "2025-10-01", 111],
        ["Gadget", "2025-04-01", 15],
        ["Gadget", "2025-07-01", 57],
      ],
    });

    expect(copy({ data }).text).toBe(
      [
        "Quarter\tDoohickey\tGadget",
        "April 1, 2025\t15\t15",
        "July 1, 2025\t51\t57",
        "October 1, 2025\t111\t",
      ].join("\n"),
    );
  });

  it("renders custom click-behavior link text like the table does", () => {
    const card = tableCard({
      column_settings: {
        '["name","NAME"]': {
          click_behavior: {
            type: "link",
            linkType: "url",
            linkTemplate: "https://example.com/{{NAME}}",
            linkTextTemplate: "open {{NAME}}",
          },
        },
      },
    });

    expect(copy({ card }).text).toBe(
      "Name\tTotal\nopen Widget\t1,234.5\nopen Gadget\t3",
    );
  });

  it("copies link columns as the resolved url, not the label", () => {
    const card = tableCard({
      column_settings: {
        '["name","NAME"]': {
          view_as: "link",
          link_text: "Click",
          link_url: "https://example.com/{{NAME}}",
        },
      },
    });

    expect(copy({ card }).text).toBe(
      [
        "Name\tTotal",
        "https://example.com/Widget\t1,234.5",
        "https://example.com/Gadget\t3",
      ].join("\n"),
    );
  });

  it("builds click metadata only for columns whose text needs it", () => {
    const rowDataCalls = jest.mocked(getTableClickedObjectRowData);

    rowDataCalls.mockClear();
    copy();
    expect(rowDataCalls).not.toHaveBeenCalled();

    const card = tableCard({
      column_settings: {
        '["name","NAME"]': {
          click_behavior: {
            type: "link",
            linkType: "url",
            linkTemplate: "https://example.com/{{NAME}}",
            linkTextTemplate: "open {{NAME}}",
          },
        },
      },
    });

    rowDataCalls.mockClear();
    copy({ card });
    expect(rowDataCalls).toHaveBeenCalledTimes(TEST_DATA.rows.length);
  });

  describe("pivot table display", () => {
    const PIVOT_CARD = createMockCard({
      display: "pivot",
      visualization_settings: {
        "pivot_table.column_split": {
          rows: ["CATEGORY"],
          columns: ["VENDOR"],
          values: ["COUNT"],
        },
        "pivot.show_row_totals": false,
        "pivot.show_column_totals": false,
      },
    });

    const PIVOT_DATA = createMockDatasetData({
      cols: [CATEGORY, VENDOR, COUNT, PIVOT_GROUPING],
      rows: [
        ["Doohickey", "Alpha", 10, 0],
        ["Doohickey", "Beta", 20, 0],
        ["Gizmo", "Alpha", 30, 0],
        [null, "Alpha", 40, 1],
      ],
    });

    const RAW_VIEW_CARD: Card = { ...PIVOT_CARD, display: "table" };

    const copyPivot = (opts: CopyOpts = {}) =>
      copy({ card: PIVOT_CARD, data: PIVOT_DATA, pivoted: true, ...opts });

    it("serializes the rendered grid when copying pivoted", () => {
      const { text, rowCount, isPivotGrid } = copyPivot();

      expect(isPivotGrid).toBe(true);
      expect(text).toBe(
        ["Category\tAlpha\tBeta", "Doohickey\t10\t20", "Gizmo\t30\t"].join(
          "\n",
        ),
      );
      expect(rowCount).toBe(2);
    });

    it("titles row dimensions like the renderer, without the currency header unit", () => {
      const price = createMockColumn({
        name: "PRICE",
        display_name: "Price",
        base_type: "type/Float",
        semantic_type: "type/Currency",
        source: "breakout",
      });
      const card = createMockCard({
        display: "pivot",
        visualization_settings: {
          "pivot_table.column_split": {
            rows: ["PRICE"],
            columns: ["VENDOR"],
            values: ["COUNT"],
          },
          "pivot.show_row_totals": false,
          "pivot.show_column_totals": false,
          column_settings: {
            '["name","PRICE"]': {
              number_style: "currency",
              currency: "USD",
              currency_in_header: true,
            },
          },
        },
      });
      const data = createMockDatasetData({
        cols: [price, VENDOR, COUNT, PIVOT_GROUPING],
        rows: [[10, "Alpha", 1, 0]],
      });

      const { text } = copy({ card, data, pivoted: true });

      expect(text.split("\n")[0]).toBe("Price\tAlpha");
    });

    it("throws when the grid cannot be laid out instead of copying nothing", () => {
      const flatDataWithoutGroupColumn = createMockDatasetData({
        cols: [CATEGORY, VENDOR, COUNT],
        rows: [["Doohickey", "Alpha", 10]],
      });
      const consoleError = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});

      try {
        expect(() => copyPivot({ data: flatDataWithoutGroupColumn })).toThrow(
          "Could not lay out the pivot table",
        );
      } finally {
        consoleError.mockRestore();
      }
    });

    it("content-translates top headers and dimension titles like the renderer", () => {
      const shout: ContentTranslationFunction = (value) =>
        typeof value === "string" ? value.toUpperCase() : value;

      expect(copyPivot({ translate: shout }).text).toBe(
        ["CATEGORY\tALPHA\tBETA", "Doohickey\t10\t20", "Gizmo\t30\t"].join(
          "\n",
        ),
      );
    });

    it("serializes flat base rows without the pivot-grouping column when not pivoted", () => {
      const { text, rowCount } = copyPivot({
        card: RAW_VIEW_CARD,
        pivoted: false,
        isPivotResult: true,
      });

      expect(text).toBe(
        [
          "Category\tVendor\tCount",
          "Doohickey\tAlpha\t10",
          "Doohickey\tBeta\t20",
          "Gizmo\tAlpha\t30",
        ].join("\n"),
      );
      expect(rowCount).toBe(3);
    });

    it("filters subtotal rows even when the grouping values are string-typed", () => {
      const data = createMockDatasetData({
        cols: [CATEGORY, VENDOR, COUNT, PIVOT_GROUPING],
        rows: [
          ["Doohickey", "Alpha", 10, "0"],
          [null, "Alpha", 40, "1"],
        ],
      });

      expect(
        copyPivot({
          card: RAW_VIEW_CARD,
          data,
          pivoted: false,
          isPivotResult: true,
        }).text,
      ).toBe(["Category\tVendor\tCount", "Doohickey\tAlpha\t10"].join("\n"));
    });

    it("serializes formatted values in the grid", () => {
      const card = createMockCard({
        display: "pivot",
        visualization_settings: {
          "pivot_table.column_split": {
            rows: ["CATEGORY"],
            columns: ["VENDOR"],
            values: ["TOTAL"],
          },
          "pivot.show_row_totals": false,
          "pivot.show_column_totals": false,
        },
      });
      const data = createMockDatasetData({
        cols: [CATEGORY, VENDOR, TOTAL_AGG, PIVOT_GROUPING],
        rows: [
          ["Doohickey", "Alpha", 1234.5, 0],
          ["Gizmo", "Alpha", 6789.1, 0],
        ],
      });

      expect(copy({ card, data, pivoted: true }).text).toBe(
        ["Category\tAlpha", "Doohickey\t1,234.5", "Gizmo\t6,789.1"].join("\n"),
      );
    });

    it("serializes multi-measure grids with subtotal and grand-total rows", () => {
      const card = createMockCard({
        display: "pivot",
        visualization_settings: {
          "pivot_table.column_split": {
            rows: ["CATEGORY"],
            columns: ["VENDOR"],
            values: ["COUNT", "TOTAL"],
          },
        },
      });
      const data = createMockDatasetData({
        cols: [CATEGORY, VENDOR, COUNT, TOTAL_AGG, PIVOT_GROUPING],
        rows: [
          ["Doohickey", "Alpha", 10, 100.5, 0],
          ["Doohickey", "Beta", 20, 200.5, 0],
          ["Gizmo", "Alpha", 30, 300.5, 0],
          ["Doohickey", null, 30, 301, 2],
          ["Gizmo", null, 30, 300.5, 2],
          [null, "Alpha", 40, 401, 1],
          [null, "Beta", 20, 200.5, 1],
          [null, null, 60, 601.5, 3],
        ],
      });

      const { text, rowCount } = copy({ card, data, pivoted: true });

      expect(text).toBe(
        [
          "\tAlpha\t\tBeta\t\tRow totals\t",
          "Category\tCount\tTotal\tCount\tTotal\tCount\tTotal",
          "Doohickey\t10\t100.5\t20\t200.5\t30\t301",
          "Gizmo\t30\t300.5\t\t\t30\t300.5",
          "Grand totals\t40\t401\t20\t200.5\t60\t601.5",
        ].join("\n"),
      );
      expect(rowCount).toBe(3);
    });
  });
});
