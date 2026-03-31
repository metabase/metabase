import { t } from "ttag";

import { SourceColorIndicator } from "metabase/common/components/SourceColorIndicator";
import { Badge, Flex, Pill } from "metabase/ui";

import type {
  ExpressionDefinitionEntry,
  MetricsViewerDefinitionEntry,
} from "../../../types/viewer-state";
import { buildExpressionForPill } from "../utils";

import S from "./MetricExpressionPill.module.css";

type MetricExpressionPillProps = {
  expressionEntry: ExpressionDefinitionEntry;
  metricEntries: MetricsViewerDefinitionEntry[];
  colors?: string[];
  onClick: (e: React.MouseEvent) => void;
  onRemove: () => void;
};

export function MetricExpressionPill({
  expressionEntry,
  metricEntries,
  colors,
  onClick,
  onRemove,
}: MetricExpressionPillProps) {
  const expression = buildExpressionForPill(
    expressionEntry.tokens,
    metricEntries,
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
