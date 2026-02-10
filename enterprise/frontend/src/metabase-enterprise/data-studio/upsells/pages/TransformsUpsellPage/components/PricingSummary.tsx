import { useDisclosure } from "@mantine/hooks";
import { useCallback } from "react";
import { t } from "ttag";

import { useMetadataToasts } from "metabase/metadata/hooks";
import { Button, Divider, Group, Text } from "metabase/ui";
import { usePurchaseCloudAddOnMutation } from "metabase-enterprise/api";
import { TransformsSettingUpModal } from "metabase-enterprise/data-studio/upsells/components";

import type { TransformTier } from "./TierSelection";

type PricingSummaryProps = {
  isTrialFlow: boolean;
  pythonPrice: number;
  selectedTier: TransformTier;
  setSelectedTier: (tier: TransformTier) => void;
  showAdvancedOnly: boolean;
  transformsPrice: number;
};

export const PricingSummary = (props: PricingSummaryProps) => {
  const {
    isTrialFlow,
    showAdvancedOnly,
    pythonPrice,
    selectedTier,
    transformsPrice,
  } = props;
  const [purchaseCloudAddOn, { isLoading: isPurchasing }] =
    usePurchaseCloudAddOnMutation();
  const [settingUpModalOpened, settingUpModalHandlers] = useDisclosure(false);
  const { sendErrorToast } = useMetadataToasts();

  // When showing advanced only, always use python price
  const selectedPrice = showAdvancedOnly
    ? pythonPrice
    : selectedTier === "basic"
      ? transformsPrice
      : pythonPrice;
  // For trial flow, due today is $0
  const dueToday = isTrialFlow ? 0 : selectedPrice;

  const handlePurchase = useCallback(async () => {
    // When showing advanced only (trial or existing basic), always purchase advanced
    const productType = showAdvancedOnly
      ? "transforms-advanced"
      : selectedTier === "basic"
        ? "transforms-basic"
        : "transforms-advanced";
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
    showAdvancedOnly,
  ]);

  return (
    <>
      <Divider />
      <Group justify="space-between" mb="sm">
        <Text c="text-secondary">{t`Due today:`}</Text>
        <Text fw="bold" data-testid="due-today-amount">{`$${dueToday}`}</Text>
      </Group>
      <Button
        variant="filled"
        size="md"
        onClick={handlePurchase}
        loading={isPurchasing}
        fullWidth
      >
        {isTrialFlow ? t`Add to trial` : t`Confirm purchase`}
      </Button>

      <TransformsSettingUpModal
        opened={settingUpModalOpened}
        onClose={() => {
          settingUpModalHandlers.close();
          window.location.reload();
        }}
        isPython={showAdvancedOnly || selectedTier === "advanced"}
      />
    </>
  );
};
