import { t } from "ttag";

import { useHasTokenFeature, useSetting } from "metabase/common/hooks";
import { getStoreUrl } from "metabase/selectors/settings";
import { List } from "metabase/ui";

import { UpsellBanner } from "./components";

export const UpsellStorage = ({ source }: { source: string }) => {
  const isHosted = useSetting("is-hosted?");
  const hasStorage = useHasTokenFeature("attached_dwh");

  if (!isHosted || hasStorage) {
    return null;
  }

  const storeAccount = getStoreUrl("account");

  return (
    <UpsellBanner
      campaign="storage"
      buttonText={t`Add`}
      buttonLink={storeAccount}
      source={source}
      title={t`Add Metabase Storage`}
      large
    >
      <List
        mt="xs"
        withPadding
        size="sm"
        styles={{ root: { paddingInlineStart: "var(--mantine-spacing-sm)" } }}
      >
        <List.Item>{t`Secure, fully managed by Metabase`}</List.Item>
        <List.Item>{t`Upload CSV files`}</List.Item>
        <List.Item>{t`Sync with Google Sheets`}</List.Item>
      </List>
    </UpsellBanner>
  );
};
