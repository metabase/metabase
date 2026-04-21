import { t } from "ttag";

import { SourceColorIndicator } from "metabase/common/components/SourceColorIndicator";
import { Badge, Flex, Pill } from "metabase/ui";

import type { ExpressionDefinitionEntry } from "../../../types/viewer-state";
import { type MetricNameMap, buildExpressionForPill } from "../utils";

import S from "./MetricExpressionPill.module.css";

type MetricExpressionPillProps = {
  expressionEntry: ExpressionDefinitionEntry;
  metricNames: MetricNameMap;
  colors?: string[];
  onClick: (e: React.MouseEvent) => void;
  onRemove: () => void;
};

export function MetricExpressionPill({
  expressionEntry,
  metricNames,
  colors,
  onClick,
  onRemove,
}: MetricExpressionPillProps) {
  const expression = buildExpressionForPill(
    expressionEntry.tokens,
    metricNames,
  );
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
      data-testid="metrics-viewer-search-pill"
    >
      <Flex align="center" gap="xs">
        <SourceColorIndicator colors={colors} />
        <Flex align="center" gap={0}>
          {expression.map((e, i) => {
            if (typeof e === "number") {
              return (
                <Badge
                  key={i}
                  circle
                  c="text-hover"
                  style={{ marginInlineStart: "0.2em" }}
                >
                  {e}
                </Badge>
              );
            }
            return (
              <span key={i} className={S.expressionText}>
                {e}
              </span>
            );
          })}
        </Flex>
      </Flex>
    </Pill>
  );
}
