import type { MouseEvent } from "react";
import { useMount } from "react-use";
import { t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useStoreUrl } from "metabase/common/hooks";
import { Button } from "metabase/ui";

import { UpsellGem } from "../components/UpsellGem";
import { trackUpsellClicked, trackUpsellViewed } from "../components/analytics";
import { useUpsellLink } from "../components/use-upsell-link";

import { useStorageSetup } from "./storage-setup-context";

const CAMPAIGN = "storage";

export const StoragePurchaseButton = ({ location }: { location: string }) => {
  const { canPurchaseStorage, openPurchaseModal, storageAddOn } =
    useStorageSetup();
  const storeUrl = useUpsellLink({
    url: useStoreUrl("account/storage"),
    campaign: CAMPAIGN,
    location,
  });

  useMount(() => {
    if (canPurchaseStorage) {
      trackUpsellViewed({ location, campaign: CAMPAIGN });
    }
  });

  if (!canPurchaseStorage) {
    return null;
  }

  const props = storageAddOn
    ? {
        onClick() {
          trackUpsellClicked({ location, campaign: CAMPAIGN });
          openPurchaseModal();
        },
      }
    : {
        component: ExternalLink,
        href: storeUrl,
        // `ExternalLink` stops propagation in the capture phase, killing any
        // `onClick` we pass. Override its capture handler instead, re-doing the
        // stopPropagation it would have done.
        onClickCapture(event: MouseEvent<HTMLElement>) {
          event.stopPropagation();
          trackUpsellClicked({ location, campaign: CAMPAIGN });
        },
      };

  return (
    <Button variant="default" leftSection={<UpsellGem />} {...props}>
      {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- Upsell for Metabase Storage, only visible to admins */}
      {t`Add Metabase Storage`}
    </Button>
  );
};
