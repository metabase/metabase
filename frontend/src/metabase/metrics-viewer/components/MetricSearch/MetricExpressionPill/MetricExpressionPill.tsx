import { t } from "ttag";

import { SourceColorIndicator } from "metabase/common/components/SourceColorIndicator";
import { Flex, Pill } from "metabase/ui";

import S from "./MetricExpressionPill.module.css";

type MetricExpressionPillProps = {
  expressionText: string;
  colors?: string[];
  onClick: (e: React.MouseEvent) => void;
  onRemove: () => void;
};

export function MetricExpressionPill({
  expressionText,
  colors,
  onClick,
  onRemove,
}: MetricExpressionPillProps) {
  return (
    <Pill
      className={S.metricExpressionPill}
      c="text-primary"
      h="2rem"
      px="sm"
      py="xs"
      fw={600}
      withRemoveButton
      onRemove={onRemove}
      removeButtonProps={{
        mr: 0,
        "aria-label": t`Remove expression`,
      }}
      onClick={onClick}
    >
      <Flex align="center" gap="xs">
        <SourceColorIndicator colors={colors} fallbackIcon="metric" />
        <span>{expressionText}</span>
      </Flex>
    </Pill>
  );
}
