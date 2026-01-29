import { useDisclosure } from "@mantine/hooks";
import { Fragment, useCallback, useState } from "react";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import {
  Button,
  Card,
  Center,
  Divider,
  DottedBackground,
  Flex,
  Group,
  Icon,
  Radio,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import { usePurchaseCloudAddOnMutation } from "metabase-enterprise/api";

import { DataStudioBreadcrumbs } from "../common/components/DataStudioBreadcrumbs";
import { PaneHeader } from "../common/components/PaneHeader";

import { LineDecorator } from "./LineDecorator";
import S from "./TransformsPurchasePage.module.css";
import { TransformsSettingUpModal } from "./TransformsSettingUpModal";
import { useTransformsBilling } from "./useTransformsBilling";

type TransformTier = "basic" | "advanced";

type TierOption = {
  value: TransformTier;
  label: string;
  price: number;
  description?: string;
};

export type TransformsPurchasePageProps = {
  bulletPoints?: string[];
};

export function TransformsPurchasePage({
  bulletPoints,
}: TransformsPurchasePageProps) {
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
  const billingPeriod = billingPeriodMonths === 1 ? t`month` : t`year`;

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

  const tierOptions: TierOption[] = [
    {
      value: "basic",
      label: t`SQL only`,
      price: transformsPrice,
    },
    {
      value: "advanced",
      label: t`SQL + Python`,
      price: pythonPrice,
      description: t`Run Python-based transforms alongside SQL to handle more complex logic and data workflows.`,
    },
  ];

  const selectedPrice =
    selectedTier === "basic" ? transformsPrice : pythonPrice;

  return (
    <DottedBackground px="3.5rem" pb="2rem">
      <PaneHeader
        breadcrumbs={
          <DataStudioBreadcrumbs>{t`Transforms`}</DataStudioBreadcrumbs>
        }
      />
      <Flex align="flex-start" justify="center" py="xl">
        <LineDecorator>
          <Card className={S.container} p={0} withBorder>
            <Stack gap="lg" className={S.leftColumn} p="xl">
              <Title
                order={2}
                // eslint-disable-next-line metabase/no-literal-metabase-strings -- This string only shows for admins.
              >{t`Start transforming your data in Metabase`}</Title>
              <Text c="text-secondary">
                {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- This string only shows for admins. */}
                {t`Clean up, reshape, and reuse data directly in Metabase. Add transforms to build models your whole team can use.`}
              </Text>
              {bulletPoints && bulletPoints.length > 0 && (
                <Stack gap="lg" py="sm">
                  {bulletPoints.map((point) => (
                    <Flex direction="row" gap="sm" key={point}>
                      <Center w={24} h={24}>
                        <Icon name="check_filled" size={16} c="text-brand" />
                      </Center>
                      <Text c="text-secondary">{point}</Text>
                    </Flex>
                  ))}
                </Stack>
              )}
            </Stack>
            {/* Right Column - Purchase Card */}
            <Stack gap="lg" className={S.rightColumn} p="xl">
              <Title order={3}>{t`Add transforms to your plan`}</Title>
              <Radio.Group
                value={selectedTier}
                onChange={(value) => setSelectedTier(value as TransformTier)}
              >
                <Stack gap="md">
                  {tierOptions.map((option) => (
                    <Fragment key={option.value}>
                      <Card
                        withBorder
                        p={0}
                        radius="md"
                        style={{
                          borderColor:
                            selectedTier === option.value
                              ? "var(--mb-color-brand)"
                              : undefined,
                          borderWidth: selectedTier === option.value ? 2 : 1,
                        }}
                      >
                        <Radio.Card value={option.value} p="md" radius="md">
                          <Flex direction="row" align="flex-start" gap="md">
                            <Center mt={2}>
                              <Radio.Indicator />
                            </Center>
                            <Flex direction="column" style={{ flex: 1 }}>
                              <Group justify="space-between" align="flex-start">
                                <Text fw="bold">{option.label}</Text>
                                <Text fw="bold">{`$${option.price} / ${billingPeriod}`}</Text>
                              </Group>
                              {option.description && (
                                <Text size="sm" c="text-secondary" mt="sm">
                                  {option.description}
                                </Text>
                              )}
                            </Flex>
                          </Flex>
                        </Radio.Card>
                      </Card>
                    </Fragment>
                  ))}
                </Stack>
              </Radio.Group>
              <Divider />
              <Stack gap="sm">
                <Group justify="space-between">
                  <Text c="text-secondary">{t`Due today:`}</Text>
                  <Text fw="bold">{`$${selectedPrice}`}</Text>
                </Group>
                <Group justify="space-between">
                  <Text c="text-secondary">{t`New total cost`}</Text>
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
                {t`Confirm purchase`}
              </Button>
            </Stack>
          </Card>
        </LineDecorator>
      </Flex>
      <TransformsSettingUpModal
        opened={settingUpModalOpened}
        onClose={() => {
          settingUpModalHandlers.close();
          window.location.reload();
        }}
        isPython={selectedTier === "advanced"}
      />
    </DottedBackground>
  );
}
