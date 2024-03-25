import { t } from "ttag";

import { SectionHeader } from "metabase/admin/settings/components/SettingsLicense";
import { getStoreUrl } from "metabase/selectors/settings";
import { Text } from "metabase/ui";

import { StoreButtonLink } from "./BillingInfo.styled";

export const BillingGoToStore = () => {
  const url = getStoreUrl();

  return (
    <>
      <SectionHeader>{t`Billing`}</SectionHeader>
      {/* eslint-disable-next-line no-literal-metabase-strings -- Torch settings */}
      <Text color="text-md">{t`Manage your Cloud account, including billing preferences, in your Torch Store account.`}</Text>
      <StoreButtonLink href={url}>
        {/* eslint-disable-next-line no-literal-metabase-strings -- Torch settings */}
        {t`Go to the Torch Store`}
      </StoreButtonLink>
    </>
  );
};
