import cx from "classnames";
import { Fragment, useMemo } from "react";
import { t } from "ttag";

import { Card, Center, Flex, Group, Radio, Stack, Text } from "metabase/ui";
import type { BillingPeriod } from "metabase-enterprise/data-studio/upsells/utils";

import S from "./TierSelection.module.css";

export type TransformTier = "basic" | "advanced";

type TierOption = {
  value: TransformTier;
  label: string;
  price: number;
  description?: string;
};

type TierSelectionProps = {
  billingPeriod: BillingPeriod;
  pythonPrice: number;
  selectedTier: TransformTier;
  setSelectedTier: (tier: TransformTier) => void;
  showAdvancedOnly: boolean;
  transformsPrice: number;
};

export const TierSelection = (props: TierSelectionProps) => {
  const {
    billingPeriod,
    pythonPrice,
    selectedTier,
    setSelectedTier,
    showAdvancedOnly,
    transformsPrice,
  } = props;

  const { tierOptions, advancedTierOption } = useMemo(() => {
    const advancedTierOption: TierOption = {
      value: "advanced",
      label: t`SQL + Python`,
      price: pythonPrice,
      description: t`Run Python-based transforms alongside SQL to handle more complex logic and data workflows.`,
    };

    const tierOptions: TierOption[] = [
      {
        value: "basic",
        label: t`SQL only`,
        price: transformsPrice,
      },
      advancedTierOption,
    ];

    return {
      tierOptions,
      advancedTierOption,
    };
  }, [pythonPrice, transformsPrice]);

  if (showAdvancedOnly) {
    // Single tier display (trial or upgrade from basic)
    return (
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
    );
  }

  // Multi-tier selection (regular user)
  return (
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
                [S.selectedTierOptionCard]: selectedTier === option.value,
              })}
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
  );
};
