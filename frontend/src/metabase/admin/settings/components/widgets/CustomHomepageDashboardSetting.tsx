import { t } from "ttag";

import { useAdminSetting } from "metabase/api/utils";
import { DashboardSelector } from "metabase/components/DashboardSelector";
import { useDispatch } from "metabase/lib/redux";
import { refreshCurrentUser } from "metabase/redux/user";
import { Stack } from "metabase/ui";
import type { DashboardId } from "metabase-types/api";

import { trackCustomHomepageDashboardEnabled } from "../../analytics";
import { SettingHeader } from "../SettingHeader";

import { BasicAdminSettingInput } from "./AdminSettingInput";

export function CustomHomepageDashboardSetting() {
  const {
    value: customHomepage,
    updateSetting,
    description,
  } = useAdminSetting("custom-homepage");
  const { value: customHomepageDashboardId } = useAdminSetting(
    "custom-homepage-dashboard",
  );
  const dispatch = useDispatch();

  const handleDashboardChange = async (newDashboardId?: DashboardId) => {
    const result = await updateSetting({
      key: "custom-homepage-dashboard",
      value: newDashboardId ?? null,
    });

    if (!result) {
      return;
    }

    if (newDashboardId && !customHomepageDashboardId) {
      trackCustomHomepageDashboardEnabled("admin");
    }

    await updateSetting({
      key: "dismissed-custom-dashboard-toast",
      value: true,
      toast: false,
    });

    await dispatch(refreshCurrentUser());
  };

  const handleToggleChange = async (newValue: boolean) => {
    await updateSetting({
      key: "custom-homepage",
      value: newValue,
      toast: false,
    });
    if (newValue === false) {
      await updateSetting({
        key: "custom-homepage-dashboard",
        value: null,
      });
    }

    await dispatch(refreshCurrentUser());
  };

  return (
    <Stack data-testid="custom-homepage-setting">
      <SettingHeader
        id="custom-homepage"
        title={t`Custom Homepage`}
        description={description}
      />
      <BasicAdminSettingInput
        name="custom-homepage"
        inputType="boolean"
        value={customHomepage}
        onChange={(newValue) => handleToggleChange(Boolean(newValue))}
      />
      {customHomepage && (
        <div data-testid="custom-homepage-dashboard-setting">
          <DashboardSelector
            value={customHomepageDashboardId ?? undefined}
            onChange={handleDashboardChange}
          />
        </div>
      )}
    </Stack>
  );
}
