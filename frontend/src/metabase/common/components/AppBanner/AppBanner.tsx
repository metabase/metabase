import dayjs from "dayjs";

import { useSetting, useUserSetting } from "metabase/common/hooks";
import { PLUGIN_SECURITY_CENTER } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { getIsHosted } from "metabase/selectors/settings";
import { getUserIsAdmin } from "metabase/selectors/user";
import { isWithinIframe } from "metabase/utils/iframe";

import { DevModeBanner } from "./DevModeBanner";
import {
  LicenseTokenMissingBanner,
  useLicenseTokenMissingBanner,
} from "./LicenseTokenMissingBanner";
import { PaymentBanner } from "./PaymentBanner/PaymentBanner";
import { ReadOnlyBanner } from "./ReadOnlyBanner";
import { TrialBanner } from "./TrialBanner";
import { getCurrentUTCTimestamp, shouldShowTrialBanner } from "./utils";

export const AppBanner = () => {
  const [lastDismissed, setLastDismissed] = useUserSetting(
    "trial-banner-dismissal-timestamp",
  );

  const isAdmin = useSelector(getUserIsAdmin);
  const isHosted = useSelector(getIsHosted);
  const tokenStatus = useSetting("token-status");
  const migrateReadOnly = useSetting("read-only-mode");
  const isDevMode = useSetting("development-mode?");

  const { shouldShowLicenseTokenMissingBanner, dismissBanner } =
    useLicenseTokenMissingBanner(isAdmin);

  const tokenExpiryTimestamp = tokenStatus?.["valid-thru"];
  const isValidTrial = tokenExpiryTimestamp && tokenStatus?.trial && isHosted;

  const paymentStatuses = ["past-due", "unpaid", "invalid"];
  const shouldRenderPaymentBanner =
    !isHosted &&
    tokenStatus &&
    paymentStatuses.includes(tokenStatus?.status ?? "");

  // Most banners are only visible to admins, but DevModeBanner gets shown to all users
  if (!isAdmin) {
    return migrateReadOnly ? (
      <ReadOnlyBanner />
    ) : isDevMode ? (
      <DevModeBanner />
    ) : null;
  }

  if (migrateReadOnly) {
    return <ReadOnlyBanner />;
  }

  if (shouldShowLicenseTokenMissingBanner) {
    return <LicenseTokenMissingBanner onClose={dismissBanner} />;
  }

  if (isValidTrial) {
    const daysRemaining = dayjs(tokenExpiryTimestamp).diff(
      getCurrentUTCTimestamp(),
      "days",
    );

    const showBanner = shouldShowTrialBanner({
      tokenExpiryTimestamp,
      daysRemaining,
      lastDismissed,
      isWithinIframe: isWithinIframe(),
    });

    if (showBanner) {
      return (
        <TrialBanner
          daysRemaining={daysRemaining}
          onClose={() => setLastDismissed(getCurrentUTCTimestamp())}
        />
      );
    }
  }

  if (shouldRenderPaymentBanner) {
    return <PaymentBanner tokenStatus={tokenStatus} />;
  }

  if (PLUGIN_SECURITY_CENTER.isEnabled) {
    const { SecurityCenterBanner } = PLUGIN_SECURITY_CENTER;
    return <SecurityCenterBanner />;
  }

  if (isDevMode) {
    return <DevModeBanner />;
  }

  // Do not render to admins if the specific conditions haven't been met
  return null;
};
