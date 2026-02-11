import { useDisclosure } from "@mantine/hooks";
import { useCallback } from "react";
import { t } from "ttag";

import { useMetadataToasts } from "metabase/metadata/hooks";
import { Button, Divider, Group, Text } from "metabase/ui";
import { usePurchaseCloudAddOnMutation } from "metabase-enterprise/api";
import { TransformsSettingUpModal } from "metabase-enterprise/data-studio/upsells/components";

import type { TransformTier } from "./TierSelection";

type PricingSummaryProps = {
  dueTodayAmount: number;
  isOnTrial: boolean;
  selectedTier: TransformTier;
};

export const PricingSummary = (props: PricingSummaryProps) => {
  const { isOnTrial, dueTodayAmount, selectedTier } = props;
  const [purchaseCloudAddOn, { isLoading: isPurchasing }] =
    usePurchaseCloudAddOnMutation();
  const [settingUpModalOpened, settingUpModalHandlers] = useDisclosure(false);
  const { sendErrorToast } = useMetadataToasts();

  const handlePurchase = useCallback(async () => {
    const productType =
      selectedTier === "basic" ? "transforms-basic" : "transforms-advanced";
    settingUpModalHandlers.open();
    try {
      await purchaseCloudAddOn({
        product_type: productType,
      }).unwrap();
    } catch {
      sendErrorToast(
        t`It looks like something went wrong. Please refresh the page and try again.`,
      );
      settingUpModalHandlers.close();
    }
  }, [
    purchaseCloudAddOn,
    selectedTier,
    sendErrorToast,
    settingUpModalHandlers,
  ]);

  return (
    <>
      <Divider />
      <Group justify="space-between" mb="sm">
        <Text c="text-secondary">{t`Due today:`}</Text>
        <Text
          fw="bold"
          data-testid="due-today-amount"
        >{`$${dueTodayAmount}`}</Text>
      </Group>
      <Button
        variant="filled"
        size="md"
        onClick={handlePurchase}
        loading={isPurchasing}
        fullWidth
      >
        {isOnTrial ? t`Add to trial` : t`Confirm purchase`}
      </Button>

      <TransformsSettingUpModal
        opened={settingUpModalOpened}
        onClose={() => {
          settingUpModalHandlers.close();
          window.location.reload();
        }}
        isPython={selectedTier === "advanced"}
      />
    </>
  );
};
