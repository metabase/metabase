import { useMount } from "react-use";
import { t } from "ttag";

import { useStoreUrl } from "metabase/common/hooks/use-store-url/use-store-url";
import { Button } from "metabase/ui";

import { UpsellGem } from "../components/UpsellGem";
import { trackUpsellClicked, trackUpsellViewed } from "../components/analytics";

import { useStorageSetup } from "./storage-setup-context";

const CAMPAIGN = "storage";

export const StoragePurchaseButton = ({ location }: { location: string }) => {
  const { canSetUpStorage, openPurchaseModal, storageAddOn } =
    useStorageSetup();
  const storeUrl = useStoreUrl("account/storage");

  useMount(() => {
    if (canSetUpStorage) {
      trackUpsellViewed({ location, campaign: CAMPAIGN });
    }
  });

  if (!canSetUpStorage) {
    return null;
  }

  const handleClick = () => {
    trackUpsellClicked({ location, campaign: CAMPAIGN });
    if (storageAddOn) {
      openPurchaseModal();
    }
  };

  const linkProps = storageAddOn
    ? null
    : {
        component: "a" as const,
        href: storeUrl,
        target: "_blank",
        rel: "noopener noreferrer",
      };

  return (
    <Button
      variant="default"
      leftSection={<UpsellGem />}
      onClick={handleClick}
      {...linkProps}
    >
      {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- Upsell for Metabase Storage, only visible to admins */}
      {t`Add Metabase Storage`}
    </Button>
  );
};
