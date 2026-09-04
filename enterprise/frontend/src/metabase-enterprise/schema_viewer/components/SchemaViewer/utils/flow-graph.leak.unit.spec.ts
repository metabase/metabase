import {
  formatRetentionProfile,
  profileCacheRetention,
  requireGarbageCollection,
  settleAndCollect,
} from "__support__/memory";
import type { ErdResponse } from "metabase-types/api";
import {
  createMockErdField,
  createMockErdNode,
  createMockErdResponse,
} from "metabase-types/api/mocks";

import { toFlowGraph } from "./flow-graph";

const TABLES_PER_SCHEMA = 60;
const FIELDS_PER_TABLE = 25;
const SCHEMA_COUNT = 25;

// Pass 3 measured +2.1 MB, at 168 KB per schema, when the memo key was a
// serialization of the whole schema. See profileCacheRetention for why pass 1
// is not asserted.
const RETENTION_BUDGET_MB = 0.5;

/**
 * A schema roughly the shape of a mid-sized warehouse. The old memo key
 * serialized every field of every table, so it grew with the whole schema.
 */
function makeSchema(schemaIndex: number): ErdResponse {
  const nodes = Array.from({ length: TABLES_PER_SCHEMA }, (_, tableIndex) => {
    const tableId = schemaIndex * TABLES_PER_SCHEMA + tableIndex;

    return createMockErdNode({
      table_id: tableId,
      name: `table_${tableId}`,
      display_name: `Table ${tableId}`,
      schema: `schema_${schemaIndex}`,
      fields: Array.from({ length: FIELDS_PER_TABLE }, (_, fieldIndex) =>
        createMockErdField({
          id: tableId * FIELDS_PER_TABLE + fieldIndex,
          name: `column_${fieldIndex}_of_table_${tableId}`,
          display_name: `Column ${fieldIndex} of table ${tableId}`,
        }),
      ),
    });
  });

  return createMockErdResponse({ nodes });
}

function makeSchemas(firstIndex: number, count: number): ErdResponse[] {
  return Array.from({ length: count }, (_, index) =>
    makeSchema(firstIndex + index),
  );
}

function buildGraphs(schemas: ErdResponse[]) {
  schemas.forEach((schema) => toFlowGraph(schema));
}

function makeGraphRef(): WeakRef<object> {
  return new WeakRef(toFlowGraph(makeSchema(950)));
}

describe("toFlowGraph caching", () => {
  it("releases a graph once its response is dropped", async () => {
    requireGarbageCollection();

    const graph = makeGraphRef();
    await settleAndCollect();

    expect(graph.deref()).toBeUndefined();
  });

  it("retains nothing once the responses are dropped", () => {
    requireGarbageCollection();

    const profile = profileCacheRetention({
      driveNewKeys: () => buildGraphs(makeSchemas(0, SCHEMA_COUNT)),
      driveSameKeys: () => buildGraphs(makeSchemas(0, SCHEMA_COUNT)),
      driveMoreNewKeys: () =>
        buildGraphs(makeSchemas(SCHEMA_COUNT, SCHEMA_COUNT)),
    });

    // eslint-disable-next-line no-console
    console.log(
      formatRetentionProfile(profile, {
        entryCount: SCHEMA_COUNT,
        entryLabel: `distinct schemas of ${TABLES_PER_SCHEMA} tables x ${FIELDS_PER_TABLE} fields`,
      }),
    );

    expect(profile.moreNewKeysMb).toBeLessThan(RETENTION_BUDGET_MB);
  });
});
