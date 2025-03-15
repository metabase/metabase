import { t } from "ttag";

import { useAdminSetting } from "metabase/api";
import { useToast } from "metabase/common/hooks";
import { DashboardSelector } from "metabase/components/DashboardSelector";
import { useDispatch } from "metabase/lib/redux";
import { refreshCurrentUser } from "metabase/redux/user";
import { Stack } from "metabase/ui";
import type { DashboardId } from "metabase-types/api";

import { trackCustomHomepageDashboardEnabled } from "../../analytics";
import { SettingHeader } from "../SettingHeader";

import { BasicAdminSettingInput } from "./AdminSettingInput";

export function CustomHomepageDashboardSetting() {
  const { value: customHomepage, updateSetting } =
    useAdminSetting("custom-homepage");
  const { value: customHomepageDashboardId } = useAdminSetting(
    "custom-homepage-dashboard",
  );
  const dispatch = useDispatch();
  const [sendToast] = useToast();

  const handleDashboardChange = async (newDashboardId?: DashboardId) => {
    const result = await updateSetting({
      key: "custom-homepage-dashboard",
      value: newDashboardId,
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
    });

    sendToast({ message: t`Changes saved`, icon: "check" });

    await dispatch(refreshCurrentUser());
  };

  const handleToggleChange = async (newValue: boolean) => {
    await updateSetting({
      key: "custom-homepage",
      value: newValue,
    });
    await dispatch(refreshCurrentUser());

    if (customHomepageDashboardId || !newValue) {
      sendToast({ message: t`Changes saved`, icon: "check" });
    }
  };

  return (
    <Stack>
      <SettingHeader
        id="custom-homepage"
        title={t`Custom Homepage`}
        description={t`Pick one of your dashboards to serve as homepage. Users without dashboard access will be directed to the default homepage.`}
      />
      <BasicAdminSettingInput
        name="custom-homepage"
        inputType="boolean"
        value={customHomepage}
        onChange={newValue => handleToggleChange(Boolean(newValue))}
      />
      {customHomepage && (
        <DashboardSelector
          value={customHomepageDashboardId ?? undefined}
          onChange={handleDashboardChange}
        />
      )}
    </Stack>
  );
}
