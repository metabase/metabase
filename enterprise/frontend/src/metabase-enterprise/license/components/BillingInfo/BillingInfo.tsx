import { t } from "ttag";

import { SettingHeader } from "metabase/admin/settings/components/SettingHeader";
import Alert from "metabase/core/components/Alert";
import { getStoreUrl } from "metabase/selectors/settings";
import { Anchor, Box, Text } from "metabase/ui";
import type { BillingInfo as IBillingInfo } from "metabase-types/api";

import { StoreButtonLink } from "./BillingInfo.styled";
import { BillingInfoTable } from "./BillingInfoTable";

interface BillingInfoProps {
  isStoreManagedBilling: boolean;
  billingInfo?: IBillingInfo | null;
  hasToken: boolean;
  error: boolean;
}

export function BillingInfo({
  isStoreManagedBilling,
  billingInfo,
  hasToken,
  error,
}: BillingInfoProps) {
  if (error) {
    return <BillingInfoError />;
  }

  if (!hasToken) {
    return <BillingGoToStore />;
  }

  if (!isStoreManagedBilling) {
    return <BillingInfoNotStoreManaged />;
  }

  if (!billingInfo || !billingInfo.content || !billingInfo.content.length) {
    return <BillingGoToStore />;
  }

  return <BillingInfoTable billingInfo={billingInfo} />;
}
const BillingInfoError = () => {
  return (
    <>
      <SettingHeader id="billing" title={t`Billing`} />
      <Box mt="1rem" data-testid="billing-info-error">
        <Alert variant="error" icon="warning">
          <Text c="text-medium">
            {t`An error occurred while fetching information about your billing.`}
            <br />
            <strong>{t`Need help?`}</strong>{" "}
            {t`You can ask for billing help at `}
            <strong>
              {/* eslint-disable-next-line i18next/no-literal-string */}
              <Anchor href="mailto:billing@metabase.com">
                billing@metabase.com
              </Anchor>
            </strong>
          </Text>
        </Alert>
      </Box>
    </>
  );
};

const BillingGoToStore = () => {
  const url = getStoreUrl();

  return (
    <>
      <SettingHeader
        id="billing"
        title={t`Billing`}
        // eslint-disable-next-line no-literal-metabase-strings -- Metabase settings
        description={t`Manage your Cloud account, including billing preferences, in your Metabase Store account.`}
      />
      <StoreButtonLink href={url}>
        {/* eslint-disable-next-line no-literal-metabase-strings -- Metabase settings */}
        {t`Go to the Metabase Store`}
      </StoreButtonLink>
    </>
  );
};

const BillingInfoNotStoreManaged = () => {
  return (
    <SettingHeader
      id="billing"
      title={t`Billing`}
      description={
        <>
          {t`To manage your billing preferences, please email `}
          {/* eslint-disable-next-line i18next/no-literal-string */}
          <Anchor href="mailto:billing@metabase.com">
            billing@metabase.com
          </Anchor>
        </>
      }
    />
  );
};
