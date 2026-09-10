import { requireGarbageCollection, settleAndCollect } from "__support__/memory";
import { createMockSettingsState, createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { getQuestionByCard } from "metabase/dashboard/selectors";
import type { State } from "metabase/redux/store";
import type { Card } from "metabase-types/api";
import {
  createMockCard,
  createMockDatabase,
  createMockField,
  createMockTable,
} from "metabase-types/api/mocks";

const FIELDS_PER_TABLE = 60;
const TABLES = 40;

/** Metadata large enough that pinning one snapshot is visible on the heap. */
function makeState(cards: Card[]): State {
  const tables = Array.from({ length: TABLES }, (_, tableIndex) =>
    createMockTable({
      id: tableIndex + 1,
      db_id: 1,
      name: `table_${tableIndex}`,
      fields: Array.from({ length: FIELDS_PER_TABLE }, (_, fieldIndex) =>
        createMockField({
          id: tableIndex * FIELDS_PER_TABLE + fieldIndex + 1,
          table_id: tableIndex + 1,
          name: `column_${fieldIndex}_of_table_${tableIndex}`,
          display_name: `Column ${fieldIndex} of table ${tableIndex}`,
        }),
      ),
    }),
  );

  return createMockState({
    settings: createMockSettingsState(),
    entities: createMockEntitiesState({
      databases: [createMockDatabase({ id: 1, tables })],
      tables,
      questions: cards,
    }),
  });
}

/**
 * Reads one card through a state of its own, so the Metadata it carries is
 * reachable only through the selector cache once this returns.
 */
function makeMetadataRef(cardId: number): WeakRef<object> {
  const card = createMockCard({ id: cardId, name: `Card ${cardId}` });
  const state = makeState([card]);
  const question = getQuestionByCard(state, { card });
  if (question == null) {
    throw new Error("expected a Question for a saved card");
  }
  return new WeakRef(question.metadata());
}

describe("getQuestionByCard caching", () => {
  it("releases the metadata snapshot once its state is gone", async () => {
    requireGarbageCollection();

    const snapshots = [
      makeMetadataRef(90_001),
      makeMetadataRef(90_002),
      makeMetadataRef(90_003),
    ];
    // Read one more card so the most recent snapshot is no longer the current
    // one. Memoization is expected to hold whatever it saw last.
    makeMetadataRef(90_004);
    await settleAndCollect();

    // The cache keys weakly on the card and the metadata, so an entry cannot
    // outlive them. Keying on the card id held one snapshot per generation.
    expect(snapshots.filter((ref) => ref.deref() !== undefined)).toEqual([]);
  });
});
