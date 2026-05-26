import { useMemo } from "react";
import { t } from "ttag";
import { findWhere } from "underscore";

import { useUpdateSettingMutation } from "metabase/api";
import { useDispatch, useSelector } from "metabase/redux";
import {
  getAvailableLocales,
  getIsStepCompleted,
  getLocale,
} from "metabase/setup/selectors";
import { Select } from "metabase/ui";

import { updateLocale } from "../../actions";
import { getLocales } from "../../utils";

export const LanguageSelector = () => {
  const dispatch = useDispatch();
  const locale = useSelector(getLocale);
  const localeData = useSelector(getAvailableLocales);
  const [updateSetting] = useUpdateSettingMutation();
  const isUserInfoStepCompleted = useSelector((state) =>
    getIsStepCompleted(state, "user_info"),
  );

  const locales = useMemo(() => getLocales(localeData), [localeData]);
  const languages = useMemo(() => locales.map(({ name }) => name), [locales]);

  const handleLocaleChange = async (language: string) => {
    const locale = findWhere(locales, { name: language });

    if (locale) {
      dispatch(updateLocale(locale));

      // Only update site-locale setting if the user has been created.
      // This prevents the API request from failing before the user creation step.
      if (isUserInfoStepCompleted) {
        await updateSetting({ key: "site-locale", value: locale.code });
      }
    }
  };

  if (!locales) {
    return;
  }

  return (
    <Select
      aria-label={t`Select a language`}
      comboboxProps={{ width: "12.5rem", position: "bottom-end" }}
      data-testid="language-selector"
      data={languages}
      onChange={handleLocaleChange}
      value={locale?.name || "English"}
    />
  );
};
