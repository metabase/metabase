import { createKeyedStore } from "../keyed-store";

export type CompareState = {
  /** What the explorer was seeded with; a different key means the data or summary tab changed since. */
  seedKey: string;
  /** The explorer's encoded state, including the user's changes. */
  hash: string;
  /** Describes what the explorer shows, for the header; `null` until it has loaded. */
  title: string | null;
};

// one comparison per source table, like summaries
const compareStore = createKeyedStore<CompareState>();

export const useCompareState = compareStore.useValue;

/** Stores the explorer state for `key`, starting over when it was seeded with something else. */
export function setCompareHash(key: string, seedKey: string, hash: string) {
  const current = compareStore.get(key);
  const title = current?.seedKey === seedKey ? current.title : null;
  compareStore.set(key, { seedKey, hash, title });
}

export function updateCompareTitle(
  key: string,
  seedKey: string,
  title: string,
) {
  const current = compareStore.get(key);
  if (current?.seedKey === seedKey) {
    compareStore.set(key, { ...current, title });
  }
}
