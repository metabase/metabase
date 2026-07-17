import { match } from "ts-pattern";
import { jt, t } from "ttag";

import { Banner } from "metabase/common/components/Banner";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useStoreUrl } from "metabase/common/hooks";
import CS from "metabase/css/core/index.css";
import { Text } from "metabase/ui";
import type { TokenStatus } from "metabase-types/api";

interface PaymentBannerProps {
  tokenStatus: TokenStatus;
}

export const PaymentBanner = ({ tokenStatus }: PaymentBannerProps) => {
  const storeUrl = useStoreUrl();

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
                href={storeUrl}
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
              href={storeUrl}
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
