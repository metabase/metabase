import type { ContentTranslationContextObject } from "./types";

export const translateString = (
  msgid: string,
  context: ContentTranslationContextObject,
) => {
  const { shouldLocalize = true, dictionary = [], locale } = context;

  if (!shouldLocalize || !dictionary.length) {
    return msgid;
  }

  const matches = dictionary.filter(entry => {
    const { locale: entryLocaleCode, msgid: entryMsgid } = entry;
    return locale === entryLocaleCode && msgid === entryMsgid;
  });

  if (matches.length > 1) {
    console.error("Multiple matches for:", locale, msgid);
  }

  return matches[0]?.msgstr || msgid;
};

type LocalizedProperty<T, K extends keyof T> =
  T extends Record<string, any>
    ? K extends string
      ? T[`${K}_localized`]
      : never
    : never;

/** Return the translated version of a property if it exists. Otherwise return the property */
export const translateProperty = <
  T extends Record<string, any>,
  K extends keyof T & string,
>(
  obj: T,
  property: K,
  translateString?: (msgid: string) => string,
): NonNullable<LocalizedProperty<T, K>> | T[K] => {
  if (!obj) {
    return obj;
  }
  const localizedKey = `${property}_localized`;
  const msgid = obj[property] as T[K];
  const translated = translateString?.(msgid) as NonNullable<
    LocalizedProperty<T, K>
  >;
  try {
    (obj as Record<typeof localizedKey, any>)[localizedKey] ??= translated;
  } catch (e) {
    console.error("Couldn't cache translation", e);
  }
  return translated || msgid;
};
