import { jt, t } from "ttag";
import Banner from "metabase/components/Banner";
import ExternalLink from "metabase/core/components/ExternalLink";
import MetabaseSettings from "metabase/lib/settings";

interface PaymentBannerProps {
  isAdmin: boolean;
  tokenStatusStatus: string | undefined;
}

export const PaymentBanner = ({
  isAdmin,
  tokenStatusStatus,
}: PaymentBannerProps) => {
  if (isAdmin && tokenStatusStatus === "past-due") {
    return (
      <Banner>
        {jt`⚠️ We couldn't process payment for your account. Please ${(
          <ExternalLink
            key="payment-past-due"
            className="link"
            href={MetabaseSettings.storeUrl()}
          >
            {t`review your payment settings`}
          </ExternalLink>
        )} to avoid service interruptions.`}
      </Banner>
    );
  } else if (isAdmin && tokenStatusStatus === "unpaid") {
    return (
      <Banner>
        {jt`⚠️ Pro features won’t work right now due to lack of payment. ${(
          <ExternalLink
            key="payment-unpaid"
            className="link"
            href={MetabaseSettings.storeUrl()}
          >
            {t`Review your payment settings`}
          </ExternalLink>
        )} to restore Pro functionality.`}
      </Banner>
    );
  }

  return null;
};

PaymentBanner.shouldRender = ({
  isAdmin,
  tokenStatusStatus,
}: PaymentBannerProps) => {
  const shouldRenderStatuses: (string | undefined)[] = ["past-due", "unpaid"];
  return isAdmin && shouldRenderStatuses.includes(tokenStatusStatus);
};
