import { getMetadata } from "metabase/selectors/metadata";
import * as Lib from "metabase-lib";
import type {
  Card,
  CardId,
  Database,
  DatabaseId,
  Table,
  TableId,
} from "metabase-types/api";
import { createMockState } from "metabase-types/store/mocks";

// Manual import is needed because we can't import from test folder directly
import { createMockEntitiesState } from "../../../frontend/test/__support__/store";
import { SAMPLE_DB_ID } from "../cypress_data";
import { SAMPLE_DATABASE } from "../cypress_sample_database";

const { ORDERS_ID, PEOPLE_ID } = SAMPLE_DATABASE;
const DEFAULT_TABLE_IDS: TableId[] = [ORDERS_ID, PEOPLE_ID];
const DEFAULT_CARD_IDS: CardId[] = [];

export function getMetadataProvider({
  databaseId = SAMPLE_DB_ID,
  tableIds = DEFAULT_TABLE_IDS,
  cardIds = DEFAULT_CARD_IDS,
}: {
  databaseId?: DatabaseId;
  tableIds?: TableId[];
  cardIds?: CardId[];
} = {}): Cypress.Chainable<Lib.MetadataProvider> {
  // Just one database for now, but wrapped to get the types to work
  const databaseIds = [databaseId];

  const requests = [
    // databases
    allRequests(
      databaseIds.map((databaseId) =>
        cy.request<Database>(`/api/database/${databaseId}`),
      ),
    ),

    // cards
    allRequests(
      tableIds.map((tableId) =>
        cy.request<Table>(`/api/table/${tableId}/query_metadata`),
      ),
    ),

    // tables
    allRequests(
      cardIds.map((cardId) =>
        cy.request<Card>(`/api/card/${cardId}/query_metadata`),
      ),
    ),
  ] as Cypress.Chainable<Database[] | Table[] | Card[]>[];

  return all(requests).then((results) => {
    const [databases, tables, cards] = results as [Database[], Table[], Card[]];
    const entities = createMockEntitiesState({
      databases,
      tables,
      questions: cards,
    });

    const state = createMockState({ entities });
    const metadata = getMetadata(state);
    const provider = Lib.metadataProvider(databaseId, metadata);

    return provider;
  });
}

function all<const T>(
  promises: T,
): T extends Cypress.Chainable<infer U>[] ? Cypress.Chainable<U[]> : never {
  // @ts-expect-error: Cypress.Promise.all types are a mess
  return Cypress.Promise.all(promises);
}

function allRequests<T>(
  requests: Cypress.Chainable<Cypress.Response<T>>[],
): Cypress.Chainable<T[]> {
  return all(requests).then((responses: Cypress.Response<T>[]) =>
    responses.map((response) => response.body),
  );
}
