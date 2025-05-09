import { useMemo } from "react";
import { findWhere } from "underscore";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { getAvailableLocales, getLocale } from "metabase/setup/selectors";
import { Select } from "metabase/ui";

import { updateLocale } from "../../actions";
import { getLocales } from "../../utils";

export const LanguageSelector = ({ w }: { w: number }) => {
  const dispatch = useDispatch();
  const locale = useSelector(getLocale);
  const localeData = useSelector(getAvailableLocales);

  const locales = useMemo(() => getLocales(localeData), [localeData]);
  const languages = locales.map(({ name }) => name);

  const handleLocaleChange = (language: string) => {
    const locale = findWhere(locales, { name: language });

    locale && dispatch(updateLocale(locale));
  };

  if (!locales) {
    return;
  }

  return (
    <Select
      w={w}
      data={languages}
      value={locale?.name || "English"}
      onChange={handleLocaleChange}
    />
  );
};
