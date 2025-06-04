import { useMemo } from "react";
import { t } from "ttag";
import { findWhere } from "underscore";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { getAvailableLocales, getLocale } from "metabase/setup/selectors";
import { Select } from "metabase/ui";

import { updateLocale } from "../../actions";
import { getLocales } from "../../utils";

export const LanguageSelector = () => {
  const dispatch = useDispatch();
  const locale = useSelector(getLocale);
  const localeData = useSelector(getAvailableLocales);

  const locales = useMemo(() => getLocales(localeData), [localeData]);
  const languages = useMemo(() => locales.map(({ name }) => name), [locales]);

  const handleLocaleChange = (language: string) => {
    const locale = findWhere(locales, { name: language });

    if (locale) {
      dispatch(updateLocale(locale));
    }
  };

  if (!locales) {
    return;
  }

  return (
    <Select
      aria-label={t`Select a language`}
      data={languages}
      value={locale?.name || "English"}
      onChange={handleLocaleChange}
    />
  );
};
