import _ from "underscore";

import type { ContentTranslationFunction } from "metabase-lib";
import type { DictionaryArray } from "metabase-types/api";

/** Translate a user-generated string
 *
 * Terminology: A "msgid" is a 'raw', untranslated string. A "msgstr" is a
 * translation of a msgid.
 * */
export const translateContentString = <
  MsgidType extends string | null | undefined,
>(
  dictionary: DictionaryArray | undefined,
  locale: string | undefined,
  /** This argument will be translated only if it is a string. If it is not a
   * string, it will be returned untranslated. */
  msgid: MsgidType,
) => {
  if (!locale) {
    return msgid;
  }

  if (typeof msgid !== "string") {
    return msgid;
  }

  if (!msgid.trim()) {
    return msgid;
  }

  const msgstr = dictionary?.find(
    (row) => row.locale === locale && row.msgid === msgid,
  )?.msgstr;

  if (!msgstr || !msgstr.trim()) {
    return msgid;
  }

  return msgstr;
};

/** Walk through obj and translate any display_name fields */
export const translateDisplayNames = <T>(
  originalObj: T,
  tc: ContentTranslationFunction,
): T => {
  const obj = structuredClone(originalObj);
  if (_.isArray(obj)) {
    return obj.map((item) => translateDisplayNames(item, tc)) as T; // TODO: this could probably be avoided somehow
  }
  if (_.isObject(obj)) {
    _.each(obj, (value, key) => {
      if (key === "display_name" && typeof value === "string") {
        obj[key] = tc(value); // FIXME
      } else if (_.isObject(value) || _.isArray(value)) {
        obj[key] = translateDisplayNames(value, tc);
      }
    });
    return obj;
  }
  return obj;
};
