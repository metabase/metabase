import { t } from "ttag";

import {
  useHasTokenFeature,
  useSetting,
  useStoreUrl,
} from "metabase/common/hooks";
import { List } from "metabase/ui";

import { UpsellBanner } from "./components";

export const UpsellStorage = ({ location }: { location: string }) => {
  const campaign = "storage";
  /**
   * @link https://linear.app/metabase/issue/CLO-4190/create-url-for-buy-storage-page-without-purchase-id
   */
  const storeUrl = useStoreUrl("account/storage");

  const isHosted = useSetting("is-hosted?");
  const hasStorage = useHasTokenFeature("attached_dwh");

  if (!isHosted || hasStorage || storeUrl === undefined) {
    return null;
  }

  return (
    <UpsellBanner
      campaign={campaign}
      buttonText={t`Add`}
      buttonLink={storeUrl}
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
