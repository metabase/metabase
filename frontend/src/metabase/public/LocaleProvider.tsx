import { type PropsWithChildren, useEffect, useState } from "react";

import { setLocaleHeader } from "metabase/lib/api";
import { loadLocalization } from "metabase/lib/i18n";

export const LocaleProvider = ({
  children,
  locale = "en",
}: PropsWithChildren<{ locale?: string | null }>) => {
  // The state is not used explicitly, but we need to trigger a re-render when the locale changes
  // as changing the locale in ttag doesn't trigger react components to update
  const [_isLoadingLocale, setIsLoadingLocale] = useState(false);

  useEffect(() => {
    if (locale) {
      setIsLoadingLocale(true);
      setLocaleHeader(locale);
      loadLocalization(locale).then(() => setIsLoadingLocale(false));
    }
  }, [locale]);

  // note: we may show a loader here while loading, this would prevent race
  // conditions and things being rendered for some time with the wrong locale
  // downside is that it would make the initial load slower
  return <>{children}</>;
};
