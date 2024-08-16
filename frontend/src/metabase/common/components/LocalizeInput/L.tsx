import yaml from "js-yaml";

import { useLocale } from "metabase/common/hooks/use-locale/use-locale";
import { useSelector } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";

export type TranslationDictionary = Record<string, Record<string, string>>;

/** Localizes user input
 *
 * The children must be a string */
export const L = ({ children }: { children: string }) => {
  const locale = useLocale();
  const translationYaml = useSelector(state =>
    getSetting(state, "input-translations"),
  );
  try {
    const translations = yaml.load(translationYaml) as TranslationDictionary;
    return translations?.[locale]?.[children] || children;
  } catch (e) {
    console.error("Could not parse translation YAML:", translationYaml);
    return children;
  }
};
