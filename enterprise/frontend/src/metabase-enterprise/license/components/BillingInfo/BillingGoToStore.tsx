import { t } from "ttag";

import { SettingHeader } from "metabase/admin/settings/components/SettingHeader";
import { getStoreUrl } from "metabase/selectors/settings";

import { StoreButtonLink } from "./BillingInfo.styled";

export const BillingGoToStore = () => {
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
