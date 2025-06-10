import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

import { useAdminSetting } from "metabase/api/utils";
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
}: {
  tokenStatus: TokenStatus | null;
  lastDismissed: Array<string>;
  isEEBuild: boolean;
}) {
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

export function useLicenseTokenMissingBanner() {
  const { value: lastDismissed = [], updateSetting: setLastDismissed } =
    useAdminSetting(SETTING_NAME);

  function dismissBanner() {
    // Keep only the last 2 dismissals
    setLastDismissed({
      key: SETTING_NAME,
      value: [...lastDismissed, getCurrentUTCTimestamp()].slice(-2),
      toast: false,
    });
  }

  const tokenStatus = useSetting("token-status");
  const shouldShowLicenseTokenMissingBanner = shouldShowBanner({
    tokenStatus,
    lastDismissed,
    isEEBuild: isEEBuild(),
  });

  return {
    dismissBanner,
    shouldShowLicenseTokenMissingBanner,
  };
}
