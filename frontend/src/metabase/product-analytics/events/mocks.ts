import { checkNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import { ORDERS_ID } from "metabase-types/api/mocks/presets";

import { findColumn } from "../find-column";

import type { EventDefinition } from "./types";

const STAGE = -1;

export type MockFilter = (query: Lib.Query) => Lib.ExpressionClause;

/** A blank query on the sample database's Orders table. */
export const ORDERS_QUERY = Lib.queryFromTableOrCardMetadata(
  SAMPLE_PROVIDER,
  checkNotNull(Lib.tableOrCardMetadata(SAMPLE_PROVIDER, ORDERS_ID)),
);

export const totalAbove =
  (value: number): MockFilter =>
  (query) =>
    Lib.numberFilterClause({
      operator: ">",
      column: findColumn(query, "TOTAL"),
      values: [value],
    });

export const discountBelow =
  (value: number): MockFilter =>
  (query) =>
    Lib.numberFilterClause({
      operator: "<",
      column: findColumn(query, "DISCOUNT"),
      values: [value],
    });

type MockEventDefinitionOpts = {
  name?: string;
  filters?: MockFilter[];
};

/** An event on Orders, matching the rows that pass every filter. */
export const createMockEventDefinition = ({
  name = "Placed an order",
  filters = [],
}: MockEventDefinitionOpts = {}): EventDefinition => ({
  name,
  query: Lib.toJsQuery(
    filters.reduce(
      (query, getFilter) => Lib.filter(query, STAGE, getFilter(query)),
      ORDERS_QUERY,
    ),
  ),
});
