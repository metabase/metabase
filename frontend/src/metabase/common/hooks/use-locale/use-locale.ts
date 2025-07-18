import { useContext } from "react";

import { getCurrentUser } from "metabase/admin/datamodel/selectors";
import { useInstanceLocale } from "metabase/common/hooks/use-instance-locale";
import { useSelector } from "metabase/lib/redux";
import { FrontendLocaleContext } from "metabase/public/LocaleProvider";

/** Get the user's locale or, if that has not been set, the instance locale
 *
 * WARNING: Certain locale codes, like 'pt_BR', are not supported by the native
 * Intl API, which wants to see 'pt-BR'. These will cause an error if they are
 * passed to String.localeCompare.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/localeCompare#locales
 * */
export const useLocale = () => {
  const instanceLocale = useInstanceLocale();
  const userLocale: string | undefined =
    useSelector(getCurrentUser)?.locale || undefined;

  // locale used in the sdk and in public/static from the #locale parameter
  const { locale: frontendLocale, isLocaleLoading } = useContext(
    FrontendLocaleContext,
  );

  return {
    locale: frontendLocale || userLocale || instanceLocale,
    isLocaleLoading,
  };
};
