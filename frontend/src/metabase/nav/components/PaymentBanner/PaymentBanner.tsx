import { match } from "ts-pattern";
import { jt, t } from "ttag";

import { Banner } from "metabase/components/Banner";
import ExternalLink from "metabase/core/components/ExternalLink";
import CS from "metabase/css/core/index.css";
import { getStoreUrl } from "metabase/selectors/settings";
import type { TokenStatus } from "metabase-types/api";

interface PaymentBannerProps {
  tokenStatus: TokenStatus;
}

export const PaymentBanner = ({ tokenStatus }: PaymentBannerProps) => {
  return match(tokenStatus.status)
    .with("past-due", () => (
      <Banner>
        {jt`⚠️ We couldn't process payment for your account. Please ${(
          <ExternalLink
            key="payment-past-due"
            className={CS.link}
            href={getStoreUrl()}
          >
            {t`review your payment settings`}
          </ExternalLink>
        )} to avoid service interruptions.`}
      </Banner>
    ))
    .with("unpaid", () => (
      <Banner>
        {jt`⚠️ Pro features won't work right now due to lack of payment. ${(
          <ExternalLink
            key="payment-unpaid"
            className={CS.link}
            href={getStoreUrl()}
          >
            {t`Review your payment settings`}
          </ExternalLink>
        )} to restore Pro functionality.`}
      </Banner>
    ))
    .with("invalid", () => (
      <Banner>
        {jt`⚠️ Pro features error. ` + (tokenStatus["error-details"] || "")}
      </Banner>
    ))
    .otherwise(() => null);
};
