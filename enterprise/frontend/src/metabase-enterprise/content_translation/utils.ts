import type { DictionaryMap } from "metabase/i18n/types";

/** Translate a user-generated string
 *
 * Terminology: A "msgid" is a 'raw', untranslated string. A "msgstr" is a
 * translation of a msgid.
 * */
export const translateContentString = <
  TypeOfMsgidArgument extends string | null | undefined,
>(
  dictionaryMap: DictionaryMap | undefined,
  /** We often need to pass in variables that have the type string|undefined,
   * so we allow variables of any type to be passed in, and they'll be
   * translated only if they're strings. */
  msgid: TypeOfMsgidArgument,
) => {
  if (typeof msgid !== "string") {
    return msgid;
  }

  if (!msgid.trim()) {
    return msgid;
  }

  const msgstr = dictionaryMap?.get(msgid);

  if (!msgstr || !msgstr.trim()) {
    return msgid;
  }

  return msgstr;
};
