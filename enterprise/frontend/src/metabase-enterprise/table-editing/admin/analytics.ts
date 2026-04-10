import { trackSimpleEvent } from "metabase/utils/analytics";

export const trackTableEditingSettingsToggled = (
  enabled: boolean,
  databaseId: number,
) =>
  trackSimpleEvent({
    event: "edit_data_settings_toggled",
    event_detail: enabled ? "on" : "off",
    target_id: databaseId,
    triggered_from: "admin-settings-databases",
  });
