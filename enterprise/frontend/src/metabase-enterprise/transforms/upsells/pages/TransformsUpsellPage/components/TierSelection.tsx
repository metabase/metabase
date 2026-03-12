import cx from "classnames";
import { Fragment, useMemo } from "react";
import { t } from "ttag";

import type { BillingPeriod } from "metabase/data-studio/upsells/types";
import { Card, Center, Flex, Group, Radio, Stack, Text } from "metabase/ui";

import S from "./TierSelection.module.css";

export type TransformTier = "basic" | "advanced";

type TierSelectionProps = {
  advancedTransformsPrice: number;
  basicTransformsPrice: number;
  billingPeriod: BillingPeriod;
  selectedTier: TransformTier;
  setSelectedTier: (tier: TransformTier) => void;
};

export const TierSelection = (props: TierSelectionProps) => {
  const {
    billingPeriod,
    advancedTransformsPrice,
    selectedTier,
    setSelectedTier,
    basicTransformsPrice,
  } = props;

  const tierOptions = useMemo(() => {
    return [
      {
        value: "basic",
        label: t`SQL only`,
        price: basicTransformsPrice,
      },
      {
        value: "advanced",
        label: t`SQL + Python`,
        price: advancedTransformsPrice,
        description: t`Run Python-based transforms alongside SQL to handle more complex logic and data workflows.`,
      },
    ];
  }, [advancedTransformsPrice, basicTransformsPrice]);
  const billingPeriodLabel = billingPeriod === "monthly" ? t`month` : t`year`;

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
                      <Text fw="bold">{`$${option.price} / ${billingPeriodLabel}`}</Text>
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
