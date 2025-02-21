import dayjs from "dayjs";

import { useSetting, useUserSetting } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
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
  const readOnly = useSetting("read-only-mode");

  const tokenExpiryTimestamp = tokenStatus?.["valid-thru"];
  const isValidTrial = tokenExpiryTimestamp && tokenStatus?.trial && isHosted;

  const paymentStatuses = ["past-due", "unpaid", "invalid"];
  const shouldRenderPaymentBanner =
    !isHosted &&
    tokenStatus &&
    paymentStatuses.includes(tokenStatus?.status ?? "");

  // Even though both the `tokenStatus` and `readOnly` settings
  // are visible only to admins (and will be `undefined` otherwise),
  // we still need to explicitly prevent rendering the banner for non-admins.
  if (!isAdmin) {
    return null;
  }

  if (readOnly) {
    return <ReadOnlyBanner />;
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

  // Do not render to admins if the specific conditions haven't been met
  return null;
};
