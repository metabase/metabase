import type {
  DictionaryArrayRow,
  RetrievedDictionaryArrayRow,
} from "metabase-types/api/content-translation";

export interface TranslationDiff {
  added: DictionaryArrayRow[];
  removed: RetrievedDictionaryArrayRow[];
  updated: {
    old: RetrievedDictionaryArrayRow;
    new: DictionaryArrayRow;
  }[];
  unchanged: RetrievedDictionaryArrayRow[];
}

export interface DiffSummary {
  hasChanges: boolean;
  addedCount: number;
  removedCount: number;
  updatedCount: number;
  unchangedCount: number;
  lostTranslations: RetrievedDictionaryArrayRow[];
  newTranslations: DictionaryArrayRow[];
}

// Create a unique key for a translation entry (locale + msgid)
const createTranslationKey = (
  translation: DictionaryArrayRow | RetrievedDictionaryArrayRow,
): string => {
  return `${translation.locale}:${translation.msgid}`;
};

export const calculateTranslationDiff = (
  current: RetrievedDictionaryArrayRow[],
  incoming: DictionaryArrayRow[],
): TranslationDiff => {
  const currentMap = new Map<string, RetrievedDictionaryArrayRow>();
  const incomingMap = new Map<string, DictionaryArrayRow>();

  // Build maps for efficient lookup
  current.forEach((translation) => {
    currentMap.set(createTranslationKey(translation), translation);
  });

  incoming.forEach((translation) => {
    incomingMap.set(createTranslationKey(translation), translation);
  });

  const diff: TranslationDiff = {
    added: [],
    removed: [],
    updated: [],
    unchanged: [],
  };

  // Find added and updated translations
  incoming.forEach((incomingTranslation) => {
    const key = createTranslationKey(incomingTranslation);
    const existingTranslation = currentMap.get(key);

    if (!existingTranslation) {
      // New translation
      diff.added.push(incomingTranslation);
    } else if (existingTranslation.msgstr !== incomingTranslation.msgstr) {
      // Updated translation
      diff.updated.push({
        old: existingTranslation,
        new: incomingTranslation,
      });
    } else {
      // Unchanged translation
      diff.unchanged.push(existingTranslation);
    }
  });

  // Find removed translations
  current.forEach((currentTranslation) => {
    const key = createTranslationKey(currentTranslation);
    if (!incomingMap.has(key)) {
      diff.removed.push(currentTranslation);
    }
  });

  return diff;
};

export const createDiffSummary = (diff: TranslationDiff): DiffSummary => {
  const hasChanges =
    diff.added.length > 0 || diff.removed.length > 0 || diff.updated.length > 0;

  return {
    hasChanges,
    addedCount: diff.added.length,
    removedCount: diff.removed.length,
    updatedCount: diff.updated.length,
    unchangedCount: diff.unchanged.length,
    lostTranslations: diff.removed,
    newTranslations: diff.added,
  };
};

// Generate a hash of the current translations state to detect race conditions
export const generateTranslationsHash = (
  translations: RetrievedDictionaryArrayRow[],
): string => {
  // Sort by id to ensure consistent hashing
  const sorted = [...translations].sort((a, b) => a.id - b.id);
  const stringToHash = sorted
    .map((t) => `${t.id}:${t.locale}:${t.msgid}:${t.msgstr}`)
    .join("|");

  // Simple hash function (for production, consider using a crypto library)
  let hash = 0;
  for (let i = 0; i < stringToHash.length; i++) {
    const char = stringToHash.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString();
};
