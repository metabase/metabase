import { requireGarbageCollection, settleAndCollect } from "__support__/memory";
import type { ErdResponse } from "metabase-types/api";
import {
  createMockErdField,
  createMockErdNode,
  createMockErdResponse,
} from "metabase-types/api/mocks";

import { toFlowGraph } from "./flow-graph";

const TABLES = 20;
const FIELDS_PER_TABLE = 10;

function makeSchema(): ErdResponse {
  const nodes = Array.from({ length: TABLES }, (_, tableIndex) =>
    createMockErdNode({
      table_id: tableIndex,
      name: `table_${tableIndex}`,
      fields: Array.from({ length: FIELDS_PER_TABLE }, (_, fieldIndex) =>
        createMockErdField({
          id: tableIndex * FIELDS_PER_TABLE + fieldIndex,
          name: `column_${fieldIndex}`,
        }),
      ),
    }),
  );

  return createMockErdResponse({ nodes });
}

/** Builds a graph and drops every reference to the response behind it. */
function makeGraphRef(): WeakRef<object> {
  return new WeakRef(toFlowGraph(makeSchema()));
}

describe("toFlowGraph caching", () => {
  it("releases a graph once its response is dropped", async () => {
    requireGarbageCollection();

    const graph = makeGraphRef();
    await settleAndCollect();

    // The memo key used to be a serialization of the whole schema, so every
    // graph and its megabyte-scale key string outlived the response.
    expect(graph.deref()).toBeUndefined();
  });
});
