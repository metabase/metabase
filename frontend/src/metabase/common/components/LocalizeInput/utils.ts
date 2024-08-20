import MetabaseSettings from "metabase/lib/settings";

export const getInputTranslationDictionary = (str: string) => {
  const supportedLocaleCodes =
    MetabaseSettings.get("available-locales")?.map(([code]) => code) || [];
  const match = str.match(/(.*) \((.+:.+)\)$/);
  const msgid = match?.[1];
  const serializedTranslations = match?.[2];
  if (serializedTranslations) {
    const translations = deserializeTranslations(
      supportedLocaleCodes,
      serializedTranslations,
    );
    return { translations, msgid: msgid as string };
  } else {
    return { translations: null, msgid: str };
  }
};

/** Get translation of user input */
export const getInputTranslation = (str: string, locale: string) => {
  const supportedLocaleCodes =
    MetabaseSettings.get("available-locales")?.map(([code]) => code) || [];
  const match = str.match(/(.*) \((.+:.+)\)$/);
  const msgid = match?.[1];
  if (!msgid) {
    return str;
  }
  const serializedTranslations = match?.[2];
  if (serializedTranslations) {
    const translations = deserializeTranslations(
      supportedLocaleCodes,
      serializedTranslations,
    );
    return translations?.[locale] || msgid;
  } else {
    return msgid;
  }
};

export const inputHasTranslation = (_str: string) => {
  // FIXME: temporarily
  return true;
  // const translations = getInputTranslationDictionary();
  // return Object.keys(translations ?? []).find(key => key.startsWith(str + "|"));
};

export const serializeTranslations = (translations: Record<string, string>) => {
  const entries = Object.entries(translations);
  return entries.length
    ? entries.map(([key, value]) => `${key}:${value}`).join(",")
    : null;
};

// FIXME: make this work for strings that contain colons and commas
export const deserializeTranslations = (
  supportedLocaleCodes: string[],
  serializedStr: string,
) => {
  if (!serializedStr) {
    return null;
  }

  const pairs = serializedStr.split(",");

  const result: Record<string, string> = {};

  for (const pair of pairs) {
    const [key, value] = pair.split(":");
    if (!key || !value) {
      return null; // Malformed string
    }
    if (!supportedLocaleCodes.includes(key)) {
      console.error("Unsupported locale", key);
      return null; // Unsupported locale
    }
    result[key] = value;
  }

  return result;
};
