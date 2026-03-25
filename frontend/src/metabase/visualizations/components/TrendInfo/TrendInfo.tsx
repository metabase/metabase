import { t } from "ttag";

import { Flex, Icon, Text, Title } from "metabase/ui";
import type { PreviousPeriodChange } from "metabase/visualizations/lib/trend-helpers";
import { formatChange } from "metabase/visualizations/visualizations/SmartScalar/utils";

import S from "./TrendInfo.module.css";

type TrendInfoProps = {
  value: string;
  dateLabel: string;
  change?: PreviousPeriodChange;
};

export function TrendInfo({ value, dateLabel, change }: TrendInfoProps) {
  const isDecrease = change != null && change.percent < 0;

  return (
    <div>
      <Title order={2} className={S.value}>
        {value}
      </Title>
      <Flex align="center" gap="xs" mt="xs" wrap="wrap">
        <Text fw={700} c="text-secondary">
          {dateLabel}
        </Text>
        {change != null && change.percent !== 0 && (
          <Flex align="center" gap={4}>
            <Icon
              name={isDecrease ? "arrow_down" : "arrow_up"}
              size={13}
              className={isDecrease ? S.decrease : S.increase}
            />
            <Text fw={900} className={isDecrease ? S.decrease : S.increase}>
              {formatChange(change.percent)}
            </Text>
            <Text c="text-secondary">{change.description}</Text>
          </Flex>
        )}
        {change != null && change.percent === 0 && (
          <Flex align="center" gap={4}>
            <Text c="text-tertiary" fw={700}>
              {t`No change`}
            </Text>
            <Text c="text-secondary">{change.description}</Text>
          </Flex>
        )}
      </Flex>
    </div>
  );
}
