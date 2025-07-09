import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

import { useUpdateSettingMutation } from "metabase/api";
import { useSetting } from "metabase/common/hooks";
import { isEEBuild } from "metabase/lib/utils";
import type { TokenStatus } from "metabase-types/api";

dayjs.extend(utc);

const DAYS_BEFORE_REPEAT_BANNER = 14;
const MAX_NUMBER_OF_DISMISSALS = 2;
const SETTING_NAME = "license-token-missing-banner-dismissal-timestamp";

export const getCurrentUTCTimestamp = () => {
  return dayjs.utc().toISOString();
};

export function shouldShowBanner({
  tokenStatus,
  lastDismissed,
  isEEBuild,
  isAdmin,
}: {
  tokenStatus: TokenStatus | null;
  lastDismissed: Array<string>;
  isEEBuild: boolean;
  isAdmin: boolean;
}) {
  if (!isAdmin) {
    return false;
  }

  if (!isEEBuild) {
    return false;
  }
  if (tokenStatus !== null) {
    return false;
  }

  if (lastDismissed.length >= MAX_NUMBER_OF_DISMISSALS) {
    return false;
  }
  if (lastDismissed.length === 0) {
    return true;
  }

  if (lastDismissed.length === 1) {
    const daysSinceLastDismissed = dayjs(getCurrentUTCTimestamp()).diff(
      lastDismissed[0],
      "days",
    );

    if (daysSinceLastDismissed < DAYS_BEFORE_REPEAT_BANNER) {
      return false;
    }
  }

  return true;
}

export function useLicenseTokenMissingBanner(isAdmin: boolean = false) {
  // This is an admin setting, but it's accessed in a common context
  const lastDismissed =
    useSetting("license-token-missing-banner-dismissal-timestamp") ?? [];
  const [updateSetting] = useUpdateSettingMutation();

  function dismissBanner() {
    updateSetting({
      key: SETTING_NAME,
      value: [...lastDismissed, getCurrentUTCTimestamp()].slice(-2),
    });
  }

  const tokenStatus = useSetting("token-status");
  const shouldShowLicenseTokenMissingBanner = shouldShowBanner({
    tokenStatus,
    lastDismissed,
    isEEBuild: isEEBuild(),
    isAdmin,
  });

  return {
    dismissBanner,
    shouldShowLicenseTokenMissingBanner,
  };
}
