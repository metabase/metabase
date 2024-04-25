import { jt, t } from "ttag";

import Banner from "metabase/components/Banner";
import ExternalLink from "metabase/core/components/ExternalLink";
import CS from "metabase/css/core/index.css";
import MetabaseSettings from "metabase/lib/settings";
import type { TokenStatus } from "metabase-types/api";

interface PaymentBannerProps {
  isAdmin: boolean;
  tokenStatus: TokenStatus;
}

export const PaymentBanner = ({ isAdmin, tokenStatus }: PaymentBannerProps) => {
  if (isAdmin && tokenStatus.status === "past-due") {
    return (
      <Banner>
        {jt`⚠️ We couldn't process payment for your account. Please ${(
          <ExternalLink
            key="payment-past-due"
            className={CS.link}
            href={MetabaseSettings.storeUrl()}
          >
            {t`review your payment settings`}
          </ExternalLink>
        )} to avoid service interruptions.`}
      </Banner>
    );
  } else if (isAdmin && tokenStatus.status === "unpaid") {
    return (
      <Banner>
        {jt`⚠️ Pro features won’t work right now due to lack of payment. ${(
          <ExternalLink
            key="payment-unpaid"
            className={CS.link}
            href={MetabaseSettings.storeUrl()}
          >
            {t`Review your payment settings`}
          </ExternalLink>
        )} to restore Pro functionality.`}
      </Banner>
    );
  } else if (isAdmin && tokenStatus.status === "invalid") {
    return (
      <Banner>
        {jt`⚠️ Pro features error. ` + (tokenStatus["error-details"] || "")}
      </Banner>
    );
  }

  return null;
};

export function shouldRenderPaymentBanner({
  isAdmin,
  tokenStatus,
}: PaymentBannerProps) {
  const shouldRenderStatuses: (string | undefined)[] = [
    "past-due",
    "unpaid",
    "invalid",
  ];
  return isAdmin && shouldRenderStatuses.includes(tokenStatus?.status);
}
