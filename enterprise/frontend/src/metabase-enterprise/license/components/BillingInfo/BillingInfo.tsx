import { t } from "ttag";

import { SettingHeader } from "metabase/admin/settings/components/SettingHeader";
import { Alert } from "metabase/common/components/Alert";
import { ButtonLink } from "metabase/common/components/ExternalLink";
import { useStoreUrl } from "metabase/common/hooks";
import { Anchor, Box, Icon, Text } from "metabase/ui";
import type { BillingInfo as IBillingInfo } from "metabase-types/api";

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
          <Text c="text-secondary">
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
  const url = useStoreUrl();

  return (
    <>
      <SettingHeader
        id="billing"
        title={t`Billing`}
        // eslint-disable-next-line metabase/no-literal-metabase-strings -- Metabase settings
        description={t`Manage your Cloud account, including billing preferences, in your Metabase Store account.`}
      />
      <ButtonLink href={url}>
        {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- Metabase settings */}
        {t`Go to the Metabase Store`}
        <Icon name="external" opacity={0.6} ml="sm" />
      </ButtonLink>
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
