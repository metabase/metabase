import { useCallback, useMemo } from "react";
import _ from "underscore";

import { useLocation, useNavigate } from "metabase/router";

import { decodeSettings, encodeSettings } from "./url-state";

type UseStoredSettingsResult<TSettings> = {
  /** The settings the user changed. Untrusted: they come from the URL. */
  storedSettings: Record<string, unknown>;
  onChangeSettings: (changes: Partial<TSettings>) => void;
};

/**
 * The settings the user changed, kept in the URL hash so a reload keeps them.
 * Each change adds a history entry, so browser back and forward step through
 * changes like undo and redo.
 */
export const useStoredSettings = <
  TSettings,
>(): UseStoredSettingsResult<TSettings> => {
  const location = useLocation();
  const navigate = useNavigate();
  const hash = location.hash.replace(/^#/, "");
  const storedSettings = useMemo(() => decodeSettings(hash), [hash]);

  const handleChangeSettings = useCallback(
    (changes: Partial<TSettings>) => {
      const newSettings = { ...storedSettings, ...changes };
      if (!_.isEqual(newSettings, storedSettings)) {
        navigate({
          pathname: location.pathname,
          search: location.search,
          hash: encodeSettings(newSettings),
        });
      }
    },
    [storedSettings, location.pathname, location.search, navigate],
  );

  return { storedSettings, onChangeSettings: handleChangeSettings };
};
