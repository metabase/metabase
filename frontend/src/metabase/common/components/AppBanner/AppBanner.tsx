import dayjs from "dayjs";

import { useSetting, useUserSetting } from "metabase/common/hooks";
import { isWithinIframe } from "metabase/lib/dom";
import { useSelector } from "metabase/lib/redux";
import { DevModeBanner } from "metabase/nav/components/DevModeBanner";
import {
  LicenseTokenMissingBanner,
  useLicenseTokenMissingBanner,
} from "metabase/nav/components/LicenseTokenMissingBanner";
import { PaymentBanner } from "metabase/nav/components/PaymentBanner/PaymentBanner";
import { ReadOnlyBanner } from "metabase/nav/components/ReadOnlyBanner";
import { TrialBanner } from "metabase/nav/components/TrialBanner";
import { getUserIsAdmin } from "metabase/selectors/user";
import { getIsHosted } from "metabase/setup/selectors";

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
    return isDevMode ? <DevModeBanner /> : null;
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

  if (isDevMode) {
    return <DevModeBanner />;
  }

  // Do not render to admins if the specific conditions haven't been met
  return null;
};
