import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import dayjs from "dayjs";
import { Fragment, useCallback, useState } from "react";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import {
  Button,
  Card,
  Center,
  Divider,
  Flex,
  Group,
  Icon,
  Radio,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import { usePurchaseCloudAddOnMutation } from "metabase-enterprise/api";

import { DataStudioBreadcrumbs } from "../../../common/components/DataStudioBreadcrumbs";
import { PaneHeader } from "../../../common/components/PaneHeader";
import { DottedBackground } from "../../../components/DottedBackground";
import { LineDecorator } from "../../components/LineDecorator";
import { TransformsSettingUpModal } from "../../components/TransformsSettingUpModal";
import { useTransformsBilling } from "../../hooks/useTransformsBilling";

import S from "./TransformsPurchasePage.module.css";

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
    isOnTrial,
    trialEndDate,
    hasBasicTransforms,
  } = useTransformsBilling();

  const hasData =
    billingPeriodMonths !== undefined && (transformsProduct || pythonProduct);
  const billingPeriod = billingPeriodMonths === 1 ? t`month` : t`year`;

  // Determine which scenario we're in:
  // - Trial user: show advanced only, $0 due today, "Add to trial"
  // - User with basic transforms: show advanced only, upgrade flow
  // - Regular user: show both tiers with radio selection
  //
  // TODO: There is also the case where the user is on a starter plan (no trial),
  // but hasn't purchased any transforms add-on yet - the way HM works is that, if
  // an add-on hasn't been purchased in the past, the first activation will be a 14
  // day trial, but we currently don't have any way to ask HM if the add-on is eligible
  // for a trial in order to show a "Try for free" CTA rather than the "Purchase" CTA.
  //
  // Without this, the worst case scenario is that the user thinks they purchased the
  // add-on, but they actually got a 14 day trial, and they end up paying for the add-on
  // after the trial ends, which is still a miscommunication.
  const showAdvancedOnly = isOnTrial || hasBasicTransforms;
  const isTrialFlow = isOnTrial && !hasBasicTransforms;

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

  // When showing advanced only, always use python price
  const selectedPrice = showAdvancedOnly
    ? pythonPrice
    : selectedTier === "basic"
      ? transformsPrice
      : pythonPrice;

  // For trial flow, due today is $0
  const dueToday = isTrialFlow ? 0 : selectedPrice;

  // Get the advanced tier option for single-tier display
  const advancedTierOption = tierOptions.find(
    (option) => option.value === "advanced",
  );

  // Determine the title based on scenario
  const getRightColumnTitle = () => {
    if (isTrialFlow) {
      return t`Add advanced transforms to your trial`;
    }
    if (hasBasicTransforms) {
      return t`Add advanced transforms to your plan`;
    }
    return t`Add transforms to your plan`;
  };

  // Determine the button text
  const getButtonText = () => {
    if (isTrialFlow) {
      return t`Add to trial`;
    }
    return t`Confirm purchase`;
  };

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
              <Title order={3}>{getRightColumnTitle()}</Title>
              {showAdvancedOnly && advancedTierOption ? (
                // Single tier display (trial or upgrade from basic)
                <Card withBorder p="md" radius="md">
                  <Flex direction="column" style={{ flex: 1 }}>
                    <Group justify="space-between" align="flex-start">
                      <Text fw="bold">{advancedTierOption.label}</Text>
                      <Text fw="bold">{`$${advancedTierOption.price} / ${billingPeriod}`}</Text>
                    </Group>
                    {advancedTierOption.description && (
                      <Text size="sm" c="text-secondary" mt="sm">
                        {advancedTierOption.description}
                      </Text>
                    )}
                  </Flex>
                </Card>
              ) : (
                // Multi-tier selection (regular user)
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
                          className={cx({
                            [S.selectedTierOptionCard]:
                              selectedTier === option.value,
                          })}
                        >
                          <Radio.Card value={option.value} p="md" radius="md">
                            <Flex direction="row" align="flex-start" gap="md">
                              <Center mt={2}>
                                <Radio.Indicator />
                              </Center>
                              <Flex direction="column" style={{ flex: 1 }}>
                                <Group
                                  justify="space-between"
                                  align="flex-start"
                                >
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
              )}
              <Divider />
              <Stack gap="sm">
                <Group justify="space-between">
                  <Text c="text-secondary">{t`Due today:`}</Text>
                  <Text fw="bold">{`$${dueToday}`}</Text>
                </Group>
                <Group justify="space-between">
                  <Text c="text-secondary">
                    {isTrialFlow && formattedTrialEndDate
                      ? t`New total cost starting ${formattedTrialEndDate}`
                      : t`New total cost`}
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
                {getButtonText()}
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
        isPython={showAdvancedOnly || selectedTier === "advanced"}
      />
    </DottedBackground>
  );
}
