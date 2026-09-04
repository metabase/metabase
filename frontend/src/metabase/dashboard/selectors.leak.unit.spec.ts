import {
  formatRetentionProfile,
  profileCacheRetention,
  requireGarbageCollection,
  settleAndCollect,
} from "__support__/memory";
import { createMockEntitiesState } from "__support__/store";
import { getQuestionByCard } from "metabase/dashboard/selectors";
import type { State } from "metabase/redux/store";
import {
  createMockSettingsState,
  createMockState,
} from "metabase/redux/store/mocks";
import type { Card } from "metabase-types/api";
import {
  createMockCard,
  createMockDatabase,
  createMockField,
  createMockTable,
} from "metabase-types/api/mocks";

const CARDS_PER_PASS = 300;
const FIELDS_PER_TABLE = 60;
const TABLES = 40;

// Each entry held a Question plus the whole Metadata snapshot it carried, so a
// pass cost 6.2 MB and 21 KB per card when the cache keyed on the card id.
const RETENTION_BUDGET_MB = 1;

function makeCards(firstId: number, count: number): Card[] {
  return Array.from({ length: count }, (_, index) =>
    createMockCard({ id: firstId + index, name: `Card ${firstId + index}` }),
  );
}

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

/** One pass that drops every reference to its state and its cards. */
function readQuestionsForCards(firstId: number) {
  const cards = makeCards(firstId, CARDS_PER_PASS);
  const state = makeState(cards);
  cards.forEach((card) => getQuestionByCard(state, { card }));
}

/**
 * Reads one card through a state of its own, so the Metadata it carries is
 * reachable only through the selector cache once this returns.
 */
function makeMetadataRef(cardId: number): WeakRef<object> {
  const cards = makeCards(cardId, 1);
  const state = makeState(cards);
  const question = getQuestionByCard(state, { card: cards[0] });
  if (question == null) {
    throw new Error("expected a Question for a saved card");
  }
  return new WeakRef(question.metadata());
}

describe("getQuestionByCard caching", () => {
  it("returns the identical Question for the same card and state", () => {
    const [card] = makeCards(1, 1);
    const state = makeState([card]);

    // connect() shallow-compares mapped props, so a fresh Question here would
    // re-render DashCardCardParameterMapper on every store change.
    expect(getQuestionByCard(state, { card })).toBe(
      getQuestionByCard(state, { card }),
    );
  });

  it("holds an entry per card rather than only the most recent one", () => {
    const cards = makeCards(10, 3);
    const state = makeState(cards);

    const first = cards.map((card) => getQuestionByCard(state, { card }));
    // Reading the other cards in between must not evict the first. A one-entry
    // cache would recompute here and re-render every mapped dashcard.
    const second = cards.map((card) => getQuestionByCard(state, { card }));

    first.forEach((question, index) => {
      expect(question).toBe(second[index]);
    });
  });

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
    const alive = snapshots.filter((ref) => ref.deref() !== undefined).length;
    // eslint-disable-next-line no-console
    console.log(`  older metadata snapshots still alive: ${alive} of 3`);
    expect(alive).toBe(0);
  });

  it("retains nothing once the cards and states are dropped", () => {
    requireGarbageCollection();

    readQuestionsForCards(0);

    const profile = profileCacheRetention({
      driveNewKeys: () => readQuestionsForCards(10_000),
      driveSameKeys: () => readQuestionsForCards(10_000),
      driveMoreNewKeys: () => readQuestionsForCards(20_000),
    });

    // eslint-disable-next-line no-console
    console.log(
      formatRetentionProfile(profile, {
        entryCount: CARDS_PER_PASS,
        entryLabel: "distinct card ids, states fully dropped",
      }),
    );

    expect(profile.moreNewKeysMb).toBeLessThan(RETENTION_BUDGET_MB);
  });
});
