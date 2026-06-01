import type { ClickObject } from "metabase-lib";
import type { DatasetColumn } from "metabase-types/api";

import { getMentionedTableCell } from "./TableInteractive";

const column = (name: string): DatasetColumn =>
  ({
    name,
    display_name: name,
    base_type: "type/Text",
  }) as DatasetColumn;

describe("getMentionedTableCell", () => {
  const createdAt = column("CREATED_AT");
  const revenue = column("REVENUE");
  const product = column("PRODUCT");

  it("returns the rendered row and value column for a mentioned data point", () => {
    const clicked: ClickObject = {
      value: 456,
      column: revenue,
      origin: {
        cols: [createdAt, revenue],
        row: ["2026-02-01", 456],
      },
    };

    expect(
      getMentionedTableCell({
        clicked,
        data: {
          cols: [createdAt, revenue],
          rows: [
            ["2026-01-01", 123],
            ["2026-02-01", 456],
          ],
        },
        isPivoted: false,
      }),
    ).toEqual({
      rowIndex: 1,
      columnIndex: 1,
      columnId: "REVENUE",
      columnRendered: true,
    });
  });

  it("matches rows when the rendered table has hidden columns", () => {
    const clicked: ClickObject = {
      value: 456,
      column: revenue,
      origin: {
        cols: [createdAt, product, revenue],
        row: ["2026-02-01", "Gadget", 456],
      },
    };

    expect(
      getMentionedTableCell({
        clicked,
        data: {
          cols: [createdAt, revenue],
          rows: [
            ["2026-01-01", 123],
            ["2026-02-01", 456],
          ],
        },
        isPivoted: false,
      }),
    ).toEqual({
      rowIndex: 1,
      columnIndex: 1,
      columnId: "REVENUE",
      columnRendered: true,
    });
  });

  it("falls back to the whole row when the referenced column is not rendered", () => {
    const clicked: ClickObject = {
      value: "Gadget",
      column: product,
      origin: {
        cols: [createdAt, product, revenue],
        row: ["2026-02-01", "Gadget", 456],
      },
    };

    expect(
      getMentionedTableCell({
        clicked,
        data: {
          cols: [createdAt, revenue],
          rows: [
            ["2026-01-01", 123],
            ["2026-02-01", 456],
          ],
        },
        isPivoted: false,
      }),
    ).toEqual({
      rowIndex: 1,
      columnIndex: 0,
      columnId: "CREATED_AT",
      columnRendered: false,
    });
  });

  it("does not resolve pivoted table cells", () => {
    expect(
      getMentionedTableCell({
        clicked: {
          value: 456,
          column: revenue,
          origin: {
            cols: [createdAt, revenue],
            row: ["2026-02-01", 456],
          },
        },
        data: {
          cols: [createdAt, revenue],
          rows: [["2026-02-01", 456]],
        },
        isPivoted: true,
      }),
    ).toBeNull();
  });
});
