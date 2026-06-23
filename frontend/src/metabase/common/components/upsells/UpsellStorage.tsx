import { t } from "ttag";

import { useSetting, useStoreUrl } from "metabase/common/hooks";
import { List } from "metabase/ui";

import { UpsellBanner } from "./components";

interface UpsellStorageProps {
  location: string;
  /** When set, the "Add" CTA triggers this instead of linking to the store. */
  onAddClick?: () => void;
}

export const UpsellStorage = ({ location, onAddClick }: UpsellStorageProps) => {
  const campaign = "storage";
  /**
   * @link https://linear.app/metabase/issue/CLO-4190/create-url-for-buy-storage-page-without-purchase-id
   */
  const storeUrl = useStoreUrl("account/storage");
  const isHosted = useSetting("is-hosted?");

  if (!isHosted) {
    return null;
  }

  return (
    <UpsellBanner
      campaign={campaign}
      buttonText={t`Add`}
      buttonLink={storeUrl}
      onClick={onAddClick}
      location={location}
      // eslint-disable-next-line metabase/no-literal-metabase-strings -- Upsell for Metabase Storage, only visible to admins
      title={t`Add Metabase Storage`}
      large
    >
      <List
        mt="xs"
        withPadding
        size="sm"
        styles={{ root: { paddingInlineStart: "var(--mantine-spacing-sm)" } }}
      >
        {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- Upsell for Metabase Storage, only visible to admins */}
        <List.Item>{t`Secure, fully managed by Metabase`}</List.Item>
        <List.Item>{t`Upload CSV files`}</List.Item>
        <List.Item>{t`Sync with Google Sheets`}</List.Item>
      </List>
    </UpsellBanner>
  );
};
