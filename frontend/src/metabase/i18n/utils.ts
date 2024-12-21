import type { Locale } from "metabase-types/store";

import type { I18nDictionary, I18nDictionaryEntry } from "./types";

export const strengthOfContextualMatch = (
  givenContext: string[] = [],
  dictionaryContextsString: string,
) => {
  const dictionaryContexts = dictionaryContextsString.split(" ");
  // A match on ids is the strongest
  const givenId = givenContext?.find(context => context.startsWith("#"));
  if (givenId && dictionaryContexts.includes(givenId)) {
    return Infinity;
  }
  // Otherwise, the number of matches determines the strength
  return _.intersection(givenContext, dictionaryContexts).length;
};

export const sortByStrengthOfContextualMatch = (
  matches: I18nDictionaryEntry[] = [],
  contexts: string[] = [],
) => {
  matches.sort((a, b) => {
    const aContext = a[3];
    const bContext = b[3];
    return (
      strengthOfContextualMatch(contexts, aContext) -
      strengthOfContextualMatch(contexts, bContext)
    );
  });
};

export const localizeDynamicContent = ({
  dictionary = [],
  localeCode,
  contexts,
  msgid,
}: {
  dictionary?: I18nDictionary;
  localeCode?: Locale["code"];
  /** The string to localize */
  msgid: string;
  /** The contexts of the string. For example:
   * suppose that when translating a dashboard (id #1) named 'Stars' (in reference to
   * celestial objects), this function is given the array
   *    ["name", "dashboard", "dashboard name", `dashboard #1`]
   * and when translating a dashboard (#99) also named 'Stars' (in reference to
   * celebrities), this function is given the array
   *    ["name", "dashboard", "dashboard name", `dashboard #99`].
   * Then the translator can provide different translations for these.
   * Or the translator can specify how anything with the name 'Stars' should be
   * translated, or how any dashboard with the name 'Stars' should be
   * translated, or how anything dashboard-related with the name 'Stars' should
   * be translated.
   *
   * This might be too much context, but let's explore how it goes.
   * */
  contexts?: string[];
}) => {
  if (!dictionary.length) {
    return msgid;
  }
  const matches = dictionary.filter(entry => {
    const [entryLocaleCode, entryMsgid, _entryMsgstr, entryContext] = entry.map(
      s => s.trim(),
    );
    if (localeCode !== entryLocaleCode) {
      return false;
    }
    if (msgid !== entryMsgid) {
      return false;
    }
    if (contexts && entryContext && !contexts.includes(entryContext)) {
      return false;
    }
    return true;
  });

  if (matches.length > 1) {
    // Sort by strength of match
    sortByStrengthOfContextualMatch(matches, contexts);
    return matches[0]?.[2];
  }
  const localized = matches[0]?.[2];
  if (!localized) {
    return msgid;
  }
  return localized;
};

// TODO: Make this into a sophisticated type guard
export const parseDictionary = (dictionaryJson: string): I18nDictionary => {
  return JSON.parse(dictionaryJson) as I18nDictionary;
};

type LocalizedProperty<T, K extends keyof T> =
  T extends Record<string, any>
    ? K extends string
      ? T[`${K}_localized`]
      : never
    : never;

/** Use the localized version of a property if possible, or fall back to the property */
export const L = <T extends Record<string, any>, K extends keyof T & string>(
  obj: T,
  property: K,
): NonNullable<LocalizedProperty<T, K>> | T[K] => {
  if (!obj) {
    return obj;
  }
  return (obj[`${property}_localized`] || obj[property]) as
    | NonNullable<LocalizedProperty<T, K>>
    | T[K];
};
