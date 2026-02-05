import { useDisclosure } from "@mantine/hooks";
import dayjs from "dayjs";
import { useCallback } from "react";
import { t } from "ttag";

import { Button, Divider, Group, Stack, Text } from "metabase/ui";
import { usePurchaseCloudAddOnMutation } from "metabase-enterprise/api";

import { TransformsSettingUpModal } from "../../../components/TransformsSettingUpModal";

import type { TransformTier } from "./TierSelection";

type PricingSummaryProps = {
  billingPeriod: string;
  isTrialFlow: boolean;
  pythonPrice: number;
  selectedTier: TransformTier;
  setSelectedTier: (tier: TransformTier) => void;
  showAdvancedOnly: boolean;
  transformsPrice: number;
  trialEndDate?: string;
};

export const PricingSummary = (props: PricingSummaryProps) => {
  const {
    isTrialFlow,
    showAdvancedOnly,
    pythonPrice,
    selectedTier,
    transformsPrice,
    trialEndDate,
    billingPeriod,
  } = props;
  const [purchaseCloudAddOn, { isLoading: isPurchasing }] =
    usePurchaseCloudAddOnMutation();
  const [settingUpModalOpened, settingUpModalHandlers] = useDisclosure(false);

  // When showing advanced only, always use python price
  const selectedPrice = showAdvancedOnly
    ? pythonPrice
    : selectedTier === "basic"
      ? transformsPrice
      : pythonPrice;
  // For trial flow, due today is $0
  const dueToday = isTrialFlow ? 0 : selectedPrice;
  const formattedTrialEndDate = trialEndDate
    ? dayjs(trialEndDate).format("MMMM D, YYYY")
    : undefined;

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
      settingUpModalHandlers.close();
    }
  }, [
    showAdvancedOnly,
    selectedTier,
    purchaseCloudAddOn,
    settingUpModalHandlers,
  ]);

  return (
    <>
      <Divider />
      <Stack gap="sm">
        <Group justify="space-between">
          <Text c="text-secondary">{t`Due today:`}</Text>
          <Text fw="bold" data-testid="due-today-amount">{`$${dueToday}`}</Text>
        </Group>
        <Group justify="space-between">
          <Text c="text-secondary">
            {isTrialFlow && formattedTrialEndDate
              ? t`New total ${billingPeriod}ly cost starting ${formattedTrialEndDate}`
              : t`New total ${billingPeriod}ly cost`}
          </Text>
          <Text fw="bold">{`$${selectedPrice}`}</Text>
        </Group>
      </Stack>
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
