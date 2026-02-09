import { useDisclosure } from "@mantine/hooks";
import { useCallback } from "react";
import { t } from "ttag";

import { trackUpsellClicked } from "metabase/admin/upsells/components/analytics";
import { Button, Card, Divider, Flex, Group, Stack, Text } from "metabase/ui";
import { usePurchaseCloudAddOnMutation } from "metabase-enterprise/api";
import { TransformsSettingUpModal } from "metabase-enterprise/data-studio/upsells/components";
import type { BillingPeriod } from "metabase-enterprise/data-studio/upsells/utils";

type CloudPurchaseContentProps = {
  billingPeriod: BillingPeriod;
  handleModalClose: VoidFunction;
  isTrialFlow: boolean;
  onError: VoidFunction;
  pythonPrice: number;
};

const CAMPAIGN = "data-studio-python-transforms";
const LOCATION = "data-studio-transforms";

export const CloudPurchaseContent = (props: CloudPurchaseContentProps) => {
  const { billingPeriod, handleModalClose, isTrialFlow, onError, pythonPrice } =
    props;
  const [purchaseCloudAddOn, { isLoading: isPurchasing }] =
    usePurchaseCloudAddOnMutation();
  const [settingUpModalOpened, settingUpModalHandlers] = useDisclosure(false);
  const dueToday = isTrialFlow ? 0 : pythonPrice;

  const handleCloudPurchase = useCallback(async () => {
    trackUpsellClicked({ location: LOCATION, campaign: CAMPAIGN });
    settingUpModalHandlers.open();
    handleModalClose();
    try {
      await purchaseCloudAddOn({
        product_type: "transforms-advanced",
      }).unwrap();
    } catch {
      settingUpModalHandlers.close();
      onError();
    }
  }, [purchaseCloudAddOn, settingUpModalHandlers, handleModalClose, onError]);
  const billingPeriodLabel = billingPeriod === "monthly" ? t`month` : t`year`;

  return (
    <>
      <Stack gap="lg">
        <Card withBorder p="md" radius="md">
          <Flex direction="column" style={{ flex: 1 }}>
            <Group justify="space-between" align="flex-start">
              <Text fw="bold">{t`SQL + Python`}</Text>
              <Text fw="bold">{`$${pythonPrice} / ${billingPeriodLabel}`}</Text>
            </Group>
            <Text size="sm" c="text-secondary" mt="sm">
              {t`Run Python-based transforms alongside SQL to handle more complex logic and data workflows.`}
            </Text>
          </Flex>
        </Card>
        <Divider />
        <Group justify="space-between" mb="sm">
          <Text c="text-secondary">{t`Due today:`}</Text>
          <Text fw="bold">{`$${dueToday}`}</Text>
        </Group>
        <Button
          variant="filled"
          size="md"
          onClick={handleCloudPurchase}
          loading={isPurchasing}
          fullWidth
        >
          {isTrialFlow ? t`Add to trial` : t`Confirm purchase`}
        </Button>
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
