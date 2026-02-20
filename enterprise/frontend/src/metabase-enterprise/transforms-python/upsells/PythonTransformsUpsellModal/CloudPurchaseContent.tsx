import { useDisclosure } from "@mantine/hooks";
import { useCallback } from "react";
import { t } from "ttag";

import { trackUpsellClicked } from "metabase/admin/upsells/components/analytics";
import type { BillingPeriod } from "metabase/data-studio/upsells/types";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Button, Card, Divider, Flex, Group, Stack, Text } from "metabase/ui";
import { usePurchaseCloudAddOnMutation } from "metabase-enterprise/api";
import { TransformsSettingUpModal } from "metabase-enterprise/transforms/upsells/components/TransformsSettingUpModal";

const CAMPAIGN = "data-studio-python-transforms";
const LOCATION = "data-studio-transforms";

type CloudPurchaseContentProps = {
  billingPeriod: BillingPeriod;
  handleModalClose: VoidFunction;
  isTrialFlow: boolean;
  pythonPrice: number;
};

export const CloudPurchaseContent = (props: CloudPurchaseContentProps) => {
  const { billingPeriod, handleModalClose, isTrialFlow, pythonPrice } = props;
  const [purchaseCloudAddOn, { isLoading: isPurchasing }] =
    usePurchaseCloudAddOnMutation();
  const [settingUpModalOpened, settingUpModalHandlers] = useDisclosure(false);
  const { sendErrorToast } = useMetadataToasts();
  const dueToday = isTrialFlow ? 0 : pythonPrice;

  const handleCloudPurchase = useCallback(async () => {
    trackUpsellClicked({ location: LOCATION, campaign: CAMPAIGN });
    settingUpModalHandlers.open();
    handleModalClose();
    try {
      await purchaseCloudAddOn({
        product_type: "transforms-advanced",
      }).unwrap();
      window.location.href = Urls.transformList(); // On success, do a full-page redirect to transforms list
    } catch {
      sendErrorToast(
        t`It looks like something went wrong. Please refresh the page and try again.`,
      );
      settingUpModalHandlers.close();
    }
  }, [
    handleModalClose,
    purchaseCloudAddOn,
    sendErrorToast,
    settingUpModalHandlers,
  ]);
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
