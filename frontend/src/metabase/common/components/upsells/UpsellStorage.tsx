import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import {
  useHasTokenFeature,
  useSetting,
  useStoreUrl,
} from "metabase/common/hooks";
import { Center, List, Loader } from "metabase/ui";

import {
  StoragePurchaseModal,
  useStorageBilling,
} from "./StoragePurchaseModal";
import { UpsellBanner } from "./components";

export const UpsellStorage = ({ location }: { location: string }) => {
  const campaign = "storage";
  /**
   * @link https://linear.app/metabase/issue/CLO-4190/create-url-for-buy-storage-page-without-purchase-id
   */
  const storeUrl = useStoreUrl("account/storage");

  const isHosted = useSetting("is-hosted?");
  const hasStorage = useHasTokenFeature("attached_dwh");
  const { storageAddOn, isLoading } = useStorageBilling();

  const [purchaseModalOpened, purchaseModalHandlers] = useDisclosure(false);

  if (!isHosted || hasStorage || storeUrl === undefined) {
    return null;
  }

  if (isLoading) {
    return (
      <Center py="md">
        <Loader data-testid="upsell-storage-loader" />
      </Center>
    );
  }

  // When the Storage add-on is purchasable in-app we open a 1-click purchase popup; otherwise we
  // fall back to linking out to the store account page.
  const canPurchaseInApp = storageAddOn != null;

  return (
    <>
      <UpsellBanner
        campaign={campaign}
        buttonText={t`Add`}
        buttonLink={storeUrl}
        onClick={canPurchaseInApp ? purchaseModalHandlers.open : undefined}
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

      {canPurchaseInApp && (
        <StoragePurchaseModal
          opened={purchaseModalOpened}
          onClose={purchaseModalHandlers.close}
          storageAddOn={storageAddOn}
        />
      )}
    </>
  );
};
