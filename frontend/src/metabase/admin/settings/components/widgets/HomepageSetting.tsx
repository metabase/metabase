import { useState } from "react";
import { t } from "ttag";

import { useAdminSetting } from "metabase/api/utils";
import { trackCustomHomepageDashboardEnabled } from "metabase/common/analytics";
import { DashboardSelector } from "metabase/common/components/DashboardSelector";
import { PLUGIN_HOMEPAGE_SETTING } from "metabase/plugins";
import { useDispatch } from "metabase/redux";
import { refreshCurrentUser } from "metabase/redux/user";
import { Box, Radio, Stack, Text } from "metabase/ui";
import type { DashboardId } from "metabase-types/api";

import { SettingHeader } from "../SettingHeader";

type Mode = "default" | "dashboard" | "url";

export function getHomepageMode(
  landingPage: string | undefined | null,
  customHomepage: boolean | undefined | null,
): Mode {
  if (landingPage && landingPage !== "/") {
    return "url";
  }
  if (customHomepage) {
    return "dashboard";
  }
  return "default";
}

export function HomepageSetting() {
  const dispatch = useDispatch();

  const { value: customHomepage, updateSettings } =
    useAdminSetting("custom-homepage");
  const { value: customHomepageDashboardId } = useAdminSetting(
    "custom-homepage-dashboard",
  );
  const { value: landingPage } = useAdminSetting("landing-page");

  const persistedMode = getHomepageMode(landingPage, customHomepage);

  // Optimistic local mode so the UI flips on click instead of waiting for the
  // bulk PUT to settle. Persisted settings naturally catch up after each save,
  // so this stays in sync without ever being cleared.
  const [localMode, setLocalMode] = useState<Mode | null>(null);

  const mode: Mode = localMode ?? persistedMode;

  // Keep the persisted dashboard id across mode switches so the user doesn't
  // re-pick when toggling away and back. Backend ignores it unless
  // custom-homepage is also true.
  const handleModeChange = async (next: Mode) => {
    setLocalMode(next);
    if (next === "default") {
      await updateSettings({
        "custom-homepage": false,
        "landing-page": "",
      });
    } else if (next === "dashboard") {
      await updateSettings({
        "custom-homepage": true,
        "landing-page": "",
      });
    } else {
      await updateSettings({
        "custom-homepage": false,
      });
    }
    await dispatch(refreshCurrentUser());
  };

  const handleDashboardChange = async (newDashboardId?: DashboardId) => {
    const wasUnset = !customHomepageDashboardId;
    await updateSettings({
      "custom-homepage-dashboard": newDashboardId ?? null,
      "dismissed-custom-dashboard-toast": true,
    });
    if (newDashboardId && wasUnset) {
      trackCustomHomepageDashboardEnabled("admin");
    }
    await dispatch(refreshCurrentUser());
  };

  return (
    <Stack data-testid="homepage-setting">
      <SettingHeader
        title={t`Homepage`}
        description={t`Where users land after signing in.`}
      />
      <Radio.Group
        value={mode}
        onChange={(v) => handleModeChange(v as Mode)}
        name="homepage-mode"
        aria-label={t`Homepage`}
      >
        <Stack gap="md">
          <Radio value="default" label={t`Default Metabase home`} />

          <Stack gap="xs">
            <Radio value="dashboard" label={t`Dashboard`} />
            {mode === "dashboard" && (
              <Box pl="xl" data-testid="custom-homepage-dashboard-setting">
                <DashboardSelector
                  value={customHomepageDashboardId ?? undefined}
                  onChange={handleDashboardChange}
                />
                <Text size="xs" c="text-secondary" mt="xs">
                  {t`Users without dashboard access see the default home.`}
                </Text>
              </Box>
            )}
          </Stack>

          {PLUGIN_HOMEPAGE_SETTING.CustomUrlOption && (
            <Stack gap="xs">
              <Radio
                value="url"
                label={PLUGIN_HOMEPAGE_SETTING.CustomUrlOption.label}
              />
              {mode === "url" && (
                <Box pl="xl">
                  <PLUGIN_HOMEPAGE_SETTING.CustomUrlOption.Control />
                </Box>
              )}
            </Stack>
          )}
        </Stack>
      </Radio.Group>
    </Stack>
  );
}
