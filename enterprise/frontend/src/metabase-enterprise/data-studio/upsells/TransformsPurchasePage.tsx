import { useDisclosure } from "@mantine/hooks";
import { useCallback, useState } from "react";
import { t } from "ttag";

import { UpsellGem } from "metabase/admin/upsells/components/UpsellGem";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import {
  Box,
  Button,
  Card,
  Center,
  Divider,
  Flex,
  Group,
  Radio,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import { usePurchaseCloudAddOnMutation } from "metabase-enterprise/api";

import { TransformsSettingUpModal } from "./TransformsSettingUpModal";
import { useTransformsBilling } from "./useTransformsBilling";

type TransformTier = "basic" | "advanced";

export function TransformsPurchasePage() {
  const [selectedTier, setSelectedTier] = useState<TransformTier>("basic");
  const [settingUpModalOpened, settingUpModalHandlers] = useDisclosure(false);
  const [purchaseCloudAddOn, { isLoading: isPurchasing }] =
    usePurchaseCloudAddOnMutation();

  const {
    isLoading,
    error,
    billingPeriodMonths,
    transformsProduct,
    pythonProduct,
  } = useTransformsBilling();

  const hasData =
    billingPeriodMonths !== undefined && (transformsProduct || pythonProduct);
  const billingPeriod = billingPeriodMonths === 1 ? t`mo` : t`yr`;

  const handlePurchase = useCallback(async () => {
    const productType =
      selectedTier === "basic" ? "transforms" : "python-execution";
    settingUpModalHandlers.open();
    try {
      await purchaseCloudAddOn({
        product_type: productType,
      }).unwrap();
    } catch {
      settingUpModalHandlers.close();
    }
  }, [selectedTier, purchaseCloudAddOn, settingUpModalHandlers]);

  // Check if there's an error loading add-on information.
  if (error) {
    return (
      <Center h="100%" bg="background-secondary">
        <LoadingAndErrorWrapper
          loading={false}
          error={t`Error fetching information about available add-ons.`}
        />
      </Center>
    );
  }

  // Show loading state if necessary, or show error if required data is missing after loading is done.
  if (!hasData || isLoading) {
    return (
      <Center h="100%" bg="background-secondary">
        <LoadingAndErrorWrapper
          loading={isLoading}
          error={
            !isLoading && !hasData
              ? t`Error fetching information about available add-ons.`
              : null
          }
        />
      </Center>
    );
  }

  const transformsPrice = transformsProduct?.default_base_fee ?? 0;
  const pythonPrice = pythonProduct?.default_base_fee ?? 0;

  return (
    <Center h="100%" bg="background-secondary">
      <Card shadow="md" p="xl" maw={600} withBorder>
        <Stack gap="lg">
          <Flex align="center" gap="xs">
            <UpsellGem size={16} />
            <Text c="text-primary">{t`Add transforms`}</Text>
          </Flex>

          {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- This string only shows for admins. */}
          <Title order={2}>{t`Tidy up your data right from Metabase`}</Title>

          <Radio.Group
            value={selectedTier}
            onChange={(value) => setSelectedTier(value as TransformTier)}
          >
            <Card withBorder p={0}>
              <Radio.Card
                value="basic"
                bg={selectedTier === "basic" ? "brand-light" : undefined}
                p="md"
                radius={0}
              >
                <Group wrap="nowrap" align="flex-start" gap="sm">
                  <Flex h="1.55rem" align="center">
                    <Radio.Indicator />
                  </Flex>
                  <Flex
                    align="flex-start"
                    direction={{ base: "column", sm: "row" }}
                    justify="space-between"
                    flex={1}
                  >
                    <Box>
                      <Text fw="bold" lh="1.55">{t`Transforms`}</Text>
                      <Text size="sm" c="text-secondary">
                        {t`10k transforms. Buy more as you go.`}
                      </Text>
                    </Box>
                    <Text fw="bold" ta={{ base: "left", sm: "right" }}>
                      {`$${transformsPrice}`}
                    </Text>
                  </Flex>
                </Group>
              </Radio.Card>

              <Divider />

              <Radio.Card
                value="advanced"
                bg={selectedTier === "advanced" ? "brand-light" : undefined}
                p="md"
                radius={0}
              >
                <Group wrap="nowrap" align="flex-start" gap="sm">
                  <Flex h="1.55rem" align="center">
                    <Radio.Indicator />
                  </Flex>
                  <Flex
                    align="flex-start"
                    direction={{ base: "column", sm: "row" }}
                    justify="space-between"
                    flex={1}
                  >
                    <Box>
                      <Text fw="bold" lh="1.55">{t`Advanced transforms`}</Text>
                      <Text size="sm" c="text-secondary">
                        {t`Get access to python based transforms.`}
                      </Text>
                    </Box>
                    <Text fw="bold" ta={{ base: "left", sm: "right" }}>
                      {t`$${pythonPrice}/${billingPeriod} + transform cost`}
                    </Text>
                  </Flex>
                </Group>
              </Radio.Card>
            </Card>
          </Radio.Group>

          <Button
            variant="filled"
            size="md"
            onClick={handlePurchase}
            loading={isPurchasing}
            fullWidth
          >
            {t`Add on transforms`}
          </Button>
        </Stack>
      </Card>

      <TransformsSettingUpModal
        opened={settingUpModalOpened}
        onClose={() => {
          settingUpModalHandlers.close();
          window.location.reload();
        }}
        isPython={selectedTier === "advanced"}
      />
    </Center>
  );
}
