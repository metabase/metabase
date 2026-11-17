import { useState } from "react";

import { PLUGIN_PERMISSION_PREVIEW } from "metabase/plugins";
import { useUserSetting } from "metabase/settings";

type NavSectionSettingKey =
  | "expand-bookmarks-in-nav"
  | "expand-browse-in-nav"
  | "expand-collections-in-nav"
  | "expand-library-in-nav";

// A permissions preview can't save the previewed person's settings, so a section's state lives in this tab until the
// preview ends with a full page load.
const previewValues = new Map<NavSectionSettingKey, boolean>();

/** Whether a main-nav section is expanded, saved as a user setting, or only for this tab during a permissions preview. */
export function useNavSectionSetting(
  key: NavSectionSettingKey,
): [boolean | undefined, (isExpanded: boolean) => void] {
  const [savedValue, setSavedValue] = useUserSetting(key);
  const [previewValue, setPreviewValue] = useState(previewValues.get(key));
  const isPreviewing =
    PLUGIN_PERMISSION_PREVIEW.getActivePreviewUserId() != null;

  if (!isPreviewing) {
    return [savedValue, setSavedValue];
  }
  return [
    previewValue ?? savedValue,
    (isExpanded) => {
      previewValues.set(key, isExpanded);
      setPreviewValue(isExpanded);
    },
  ];
}
