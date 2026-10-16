import { createMockMetadata } from "__support__/metadata";
import * as Lib from "metabase-lib";
import {
  createMockSegment,
  createMockStructuredDatasetQuery,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { findColumn } from "../find-column";

import { getEventFilterColumns } from "./filter-columns";
import type { EventDefinition } from "./types";

const STAGE = -1;
const SEGMENT_ID = 1;

const SAMPLE_DATABASE = createSampleDatabase();

const PROVIDER = Lib.metadataProvider(
  SAMPLE_DATABASE.id,
  createMockMetadata({
    databases: [SAMPLE_DATABASE],
    segments: [
      createMockSegment({
        id: SEGMENT_ID,
        table_id: ORDERS_ID,
        definition: createMockStructuredDatasetQuery({
          query: {
            "source-table": ORDERS_ID,
            filter: [">", ["field", ORDERS.DISCOUNT, null], 0],
          },
        }),
      }),
    ],
  }),
);

type SetupOpts = {
  hasSegment?: boolean;
  totalAbove?: number;
};

const setup = ({ hasSegment = false, totalAbove }: SetupOpts) => {
  const base = Lib.createTestQuery(PROVIDER, {
    stages: [
      {
        source: { type: "table", id: ORDERS_ID },
        filters: hasSegment ? [{ type: "segment", id: SEGMENT_ID }] : [],
      },
    ],
  });
  const query =
    totalAbove === undefined
      ? base
      : Lib.filter(
          base,
          STAGE,
          Lib.numberFilterClause({
            operator: ">",
            column: findColumn(base, "TOTAL"),
            values: [totalAbove],
          }),
        );
  const event: EventDefinition = {
    name: "Placed an order",
    query: Lib.toJsQuery(query),
  };
  return getEventFilterColumns(PROVIDER, event);
};

describe("getEventFilterColumns", () => {
  it("returns the columns an operator filter reads", () => {
    expect(setup({ totalAbove: 100 })).toEqual(["TOTAL"]);
  });

  it("returns nothing for a segment filter, whose columns it can't see", () => {
    expect(setup({ hasSegment: true })).toEqual([]);
  });

  it("returns the column filters' columns alongside a segment", () => {
    expect(setup({ hasSegment: true, totalAbove: 100 })).toEqual(["TOTAL"]);
  });
});
