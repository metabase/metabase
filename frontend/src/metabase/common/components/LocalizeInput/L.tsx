import { useLocale } from "metabase/common/hooks/use-locale/use-locale";

import { getInputTranslation } from "./utils";

/** Localizes user input
 *
 * The children must be a string */
export const L = ({ children }: { children: string }) => {
  const locale = useLocale();
  return getInputTranslation(children, locale);
};
