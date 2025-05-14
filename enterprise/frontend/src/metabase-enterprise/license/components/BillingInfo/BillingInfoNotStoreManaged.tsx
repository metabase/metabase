import { t } from "ttag";

import { SectionHeader } from "metabase/admin/settings/components/SettingsLicense";
import { Anchor, Text } from "metabase/ui";

export const BillingInfoNotStoreManaged = () => {
  return (
    <>
      <SectionHeader>{t`Billing`}</SectionHeader>
      <Text color="text-medium">
        {t`To manage your billing preferences, please email `}
        {/* eslint-disable-next-line i18next/no-literal-string */}
        <Anchor href="mailto:billing@metabase.com">billing@metabase.com</Anchor>
      </Text>
    </>
  );
};
