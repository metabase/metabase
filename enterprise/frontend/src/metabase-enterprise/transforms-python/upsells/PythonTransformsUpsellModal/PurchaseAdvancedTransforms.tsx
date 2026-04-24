import { useDisclosure } from "@mantine/hooks";
import { useCallback } from "react";
import { t } from "ttag";

import { trackUpsellClicked } from "metabase/common/components/upsells/components/analytics";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Button, Stack, Text } from "metabase/ui";
import { formatNumber } from "metabase/utils/formatting";
import * as Urls from "metabase/utils/urls";
import { usePurchaseCloudAddOnMutation } from "metabase-enterprise/api";
import { TransformsSettingUpModal } from "metabase-enterprise/transforms/upsells/components/TransformsSettingUpModal";
import type { ICloudAddOnProduct } from "metabase-types/api/store";

import { CAMPAIGN, LOCATION } from "./constants";

type PurchaseAdvancedTransformsProps = {
  handleModalClose: VoidFunction;
  addOn: ICloudAddOnProduct;
  freeUnitsIncluded: boolean;
};

export const PurchaseAdvancedTransforms = ({
  handleModalClose,
  addOn,
  freeUnitsIncluded,
}: PurchaseAdvancedTransformsProps) => {
  const [purchaseCloudAddOn, { isLoading: isPurchasing }] =
    usePurchaseCloudAddOnMutation();
  const [settingUpModalOpened, settingUpModalHandlers] = useDisclosure(false);
  const { sendErrorToast } = useMetadataToasts();

  const handleCloudPurchase = useCallback(async () => {
    trackUpsellClicked({ location: LOCATION, campaign: CAMPAIGN });

    settingUpModalHandlers.open();
    try {
      await purchaseCloudAddOn({
        product_type: "transforms-advanced-metered",
      }).unwrap();
      window.location.href = Urls.transformList(); // On success, do a full-page redirect to transforms list
    } catch {
      sendErrorToast(
        t`It looks like something went wrong. Please refresh the page and try again.`,
      );
    } finally {
      settingUpModalHandlers.close();
      handleModalClose();
    }
  }, [
    handleModalClose,
    purchaseCloudAddOn,
    sendErrorToast,
    settingUpModalHandlers,
  ]);

  const freeUnitsStr =
    addOn.free_units != null &&
    freeUnitsIncluded &&
    formatNumber(addOn.free_units, {
      compact: true,
      maximumFractionDigits: addOn.free_units % 1000 ? undefined : 0,
    });
  const perRunStr =
    addOn.default_price_per_unit != null &&
    `${addOn.default_price_per_unit * 100}¢`;

  return (
    <>
      <Stack gap="lg">
        {perRunStr &&
          (freeUnitsStr ? (
            <Text fw="bold" lh="sm">
              {t`${freeUnitsStr} advanced transforms included, then ${perRunStr} per transform run.`}
            </Text>
          ) : (
            <Text fw="bold" lh="sm">
              {t`You'll be charged ${perRunStr} per transform run.`}
            </Text>
          ))}
        <div>
          <Button
            variant="filled"
            size="md"
            onClick={handleCloudPurchase}
            loading={isPurchasing}
            px="3rem"
          >
            {t`Upgrade`}
          </Button>
        </div>
        <Text fz="sm" c="text-secondary" lh="md">
          {t`By clicking upgrade, you agree to be charged in accordance with our terms of service.`}
        </Text>
      </Stack>
      <TransformsSettingUpModal
        opened={settingUpModalOpened}
        onClose={() => {
          settingUpModalHandlers.close();
          window.location.reload();
        }}
        isPython
      />
    </>
  );
};
