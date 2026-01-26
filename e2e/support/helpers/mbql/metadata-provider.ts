// WARNING:
//   This module should not be imported directly in cypress
//   harnesses, use an dynamic import instead.
import { getMetadataWithoutSettings as getMetadataFromState } from "metabase/selectors/metadata";
import * as Lib from "metabase-lib";
import type {
  Card,
  CardId,
  Database,
  Table,
  TableId,
} from "metabase-types/api";

import { createMockEntitiesState } from "../../../../frontend/test/__support__/store";
import { SAMPLE_DB_ID, SAMPLE_DB_TABLES } from "../../cypress_data";

import type { GetMetadataOpts } from "./types";

const DEFAULT_TABLE_IDS: TableId[] = [
  SAMPLE_DB_TABLES.STATIC_ORDERS_ID,
  SAMPLE_DB_TABLES.STATIC_PEOPLE_ID,
  SAMPLE_DB_TABLES.STATIC_PRODUCTS_ID,
  SAMPLE_DB_TABLES.STATIC_REVIEWS_ID,
];
const DEFAULT_CARD_IDS: CardId[] = [];

/**
 * Returns a Lib.MetadataProvider instance containing metadata for the
 * provided database, tables and cards.
 *
 * WARNING:
 *   DO NOT USE THIS DIRECTLY IN TESTS.
 *   Use the `getMetadataProvider` from ./wrappers" instead.
 *
 * NOTE:
 *   This function uses plain Promises and Promise.all to avoid type issues
 *   with Cypress. The result needs to wrapped in cy.wrap() to be correctly usable
 *   in Cypress tests.
 */
export async function getMetadataProvider({
  databaseId = SAMPLE_DB_ID,
  ...rest
}: GetMetadataOpts = {}) {
  const metadata = await getMetadata({ databaseId, ...rest });
  return Lib.metadataProvider(databaseId, metadata);
}

async function getMetadata({
  databaseId = SAMPLE_DB_ID,
  tableIds = DEFAULT_TABLE_IDS,
  cardIds = DEFAULT_CARD_IDS,
}: GetMetadataOpts = {}) {
  // Just one database for now, but wrapped to get the types to work
  const databaseIds = [databaseId];

  const [databases, tables, cards] = await Promise.all([
    // databases
    Promise.all(
      databaseIds.map((databaseId) =>
        GET<Database>(`/api/database/${databaseId}`),
      ),
    ),

    // cards
    Promise.all(
      tableIds.map((tableId) =>
        GET<Table>(`/api/table/${tableId}/query_metadata`),
      ),
    ),

    // tables
    Promise.all(cardIds.map((cardId) => GET<Card>(`/api/card/${cardId}`))),
  ]);

  const entities = createMockEntitiesState({
    databases,
    tables,
    questions: cards,
  });
  return getMetadataFromState({ entities });
}

async function GET<T>(url: string): Promise<T> {
  const response = await fetch(url);
  return response.json();
}
