import _ from "underscore";

import type { TranslateDisplayNamesFunction } from "metabase/i18n/hooks";
import type { ContentTranslationFunction } from "metabase-lib";
import type { DictionaryArray } from "metabase-types/api";
import { isObject, isRecord } from "metabase-types/guards";

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

/** Walk through obj and translate any display name fields */
export const translateDisplayNames: TranslateDisplayNamesFunction = <T>(
  obj: T,
  tc: ContentTranslationFunction,
  fieldsToTranslate: string[] = ["displayName"],
): T => {
  if (_.isArray(obj)) {
    return obj.map((item) => translateDisplayNames(item, tc)) as T; // FIXME: avoid this coercion
  } else if (isRecord(obj)) {
    return Object.entries(obj).reduce<Record<string, unknown>>(
      (acc, [key, value]) => {
        let newValue: unknown;
        if (
          fieldsToTranslate.includes(key as string) &&
          typeof value === "string"
        ) {
          newValue = tc(value);
        } else if (isObject(value)) {
          newValue = translateDisplayNames(value, tc);
        } else {
          newValue = value;
        }
        return { ...acc, [key]: newValue };
      },
      {},
    ) as T;
  } else {
    return obj;
  }
};
