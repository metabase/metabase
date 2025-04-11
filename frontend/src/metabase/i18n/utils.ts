import type { ContentTranslationContextObject } from "./types";

/** Translate a user-generated string */
export const translateContentString = (
  msgid: string,
  context: ContentTranslationContextObject,
) => {
  const { shouldLocalize = true, dictionary = [], locale } = context;

  if (!shouldLocalize || !dictionary.length) {
    return msgid;
  }

  const matches = dictionary.filter((entry) => {
    const { locale: entryLocaleCode, msgid: entryMsgid } = entry;
    return locale === entryLocaleCode && msgid === entryMsgid;
  });

  if (matches.length > 1) {
    console.error("Multiple matches for:", locale, msgid);
  }

  return matches[0]?.msgstr || msgid;
};
