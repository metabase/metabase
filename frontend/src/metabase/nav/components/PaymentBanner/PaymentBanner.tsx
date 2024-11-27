import { match } from "ts-pattern";
import { jt, t } from "ttag";

import { Banner } from "metabase/components/Banner";
import ExternalLink from "metabase/core/components/ExternalLink";
import CS from "metabase/css/core/index.css";
import { getStoreUrl } from "metabase/selectors/settings";
import { Text } from "metabase/ui";
import type { TokenStatus } from "metabase-types/api";

interface PaymentBannerProps {
  tokenStatus: TokenStatus;
}

export const PaymentBanner = ({ tokenStatus }: PaymentBannerProps) => {
  return match(tokenStatus.status)
    .with("past-due", () => (
      <Banner
        icon="warning"
        body={
          <Text>
            {jt`We couldn't process payment for your account. Please ${(
              <ExternalLink
                key="payment-past-due"
                className={CS.link}
                href={getStoreUrl()}
              >
                {t`review your payment settings`}
              </ExternalLink>
            )} to avoid service interruptions.`}
          </Text>
        }
      ></Banner>
    ))
    .with("unpaid", () => (
      <Banner
        icon="warning"
        body={
          <Text>{jt`Pro features won't work right now due to lack of payment. ${(
            <ExternalLink
              key="payment-unpaid"
              className={CS.link}
              href={getStoreUrl()}
            >
              {t`Review your payment settings`}
            </ExternalLink>
          )} to restore Pro functionality.`}</Text>
        }
      ></Banner>
    ))
    .with("invalid", () => (
      <Banner
        icon="warning"
        body={
          <Text>
            {jt`Pro features error. ` + (tokenStatus["error-details"] || "")}
          </Text>
        }
      ></Banner>
    ))
    .otherwise(() => null);
};
