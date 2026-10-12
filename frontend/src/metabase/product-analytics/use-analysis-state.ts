import { useCallback, useState } from "react";
import _ from "underscore";

import { useLocation, useNavigate } from "metabase/router";

import { updateSettings } from "./settings/compute";
import type { StoredSettings } from "./settings/types";
import { decodeSettings, encodeSettings } from "./url-state";

export type AnalysisPanel = "setup" | "advanced";

const NO_SAVED_SETTINGS: StoredSettings = {};

/**
 * The settings the user changed, plus which panel is open (`null` when none
 * is). Unsaved edits live in the URL hash, so a reload keeps them. The hash is
 * empty when there are none, so a saved analysis's link always opens what was
 * saved.
 *
 * `hasUnsavedChanges` compares against the settings this page opened with or
 * last saved, so it's false as soon as a save finishes, before the card
 * refetches.
 */
export const useAnalysisState = <S>(
  savedSettings: StoredSettings = NO_SAVED_SETTINGS,
) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [stored, setStored] = useState<StoredSettings>(() => {
    const hash = location.hash.slice(1);
    return hash !== "" ? decodeSettings(hash) : savedSettings;
  });
  const [lastSaved, setLastSaved] = useState(savedSettings);
  const [panel, setPanel] = useState<AnalysisPanel | null>("setup");

  const replaceHash = useCallback(
    (hash: string) => {
      navigate(
        { pathname: location.pathname, search: location.search, hash },
        { replace: true },
      );
    },
    [location.pathname, location.search, navigate],
  );

  const handleChangeSettings = useCallback(
    (changes: Partial<S>) => {
      const next = updateSettings(stored, changes);
      setStored(next);
      replaceHash(_.isEqual(next, lastSaved) ? "" : encodeSettings(next));
    },
    [stored, lastSaved, replaceHash],
  );

  const handleSaved = useCallback(() => {
    setLastSaved(stored);
    replaceHash("");
  }, [stored, replaceHash]);

  return {
    stored,
    hasUnsavedChanges: !_.isEqual(stored, lastSaved),
    panel,
    setPanel,
    onChangeSettings: handleChangeSettings,
    onSaved: handleSaved,
  };
};
