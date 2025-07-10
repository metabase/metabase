import { t } from "ttag";

import { useHasTokenFeature, useSetting } from "metabase/common/hooks";
import { getStoreUrl } from "metabase/selectors/settings";
import { List } from "metabase/ui";

import { UpsellBanner } from "./components";

/**
 * @link https://linear.app/metabase/issue/CLO-4190/create-url-for-buy-storage-page-without-purchase-id
 */
export const BUY_STORAGE_URL = getStoreUrl("account/storage");

export const UpsellStorage = ({ location }: { location: string }) => {
  const isHosted = useSetting("is-hosted?");
  const hasStorage = useHasTokenFeature("attached_dwh");

  if (!isHosted || hasStorage) {
    return null;
  }

  return (
    <UpsellBanner
      campaign="storage"
      buttonText={t`Add`}
      buttonLink={BUY_STORAGE_URL}
      location={location}
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
