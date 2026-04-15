import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "ttag";

import { EditableText } from "metabase/common/components/EditableText";
import { SourceColorIndicator } from "metabase/common/components/SourceColorIndicator";
import { Badge, Flex, Pill } from "metabase/ui";

import type { ExpressionDefinitionEntry } from "../../../types/viewer-state";
import {
  type MetricNameMap,
  buildExpressionForPill,
  buildExpressionText,
} from "../utils";

import S from "./MetricExpressionPill.module.css";

type MetricExpressionPillProps = {
  expressionEntry: ExpressionDefinitionEntry;
  metricNames: MetricNameMap;
  colors?: string[];
  onNameChange: (name: string) => void;
  onRemove: () => void;
};

export function MetricExpressionPill({
  expressionEntry,
  metricNames,
  colors,
  onNameChange,
  onRemove,
}: MetricExpressionPillProps) {
  const [isEditing, setIsEditing] = useState(false);
  const editableRef = useRef<HTMLDivElement>(null);

  const expressionText = useMemo(
    () => buildExpressionText(expressionEntry.tokens, metricNames),
    [expressionEntry.tokens, metricNames],
  );

  const hasCustomName =
    expressionEntry.name && expressionEntry.name !== expressionText;

  const expressionForPill = useMemo(
    () => buildExpressionForPill(expressionEntry.tokens, metricNames),
    [expressionEntry.tokens, metricNames],
  );

  useEffect(() => {
    if (isEditing) {
      const textarea = editableRef.current?.querySelector("textarea");
      if (textarea) {
        textarea.focus();
        const len = textarea.value.length;
        textarea.setSelectionRange(0, len);
      }
    }
  }, [isEditing]);

  const handleClick = useCallback(() => {
    if (!isEditing) {
      setIsEditing(true);
    }
  }, [isEditing]);

  const handleBlur = useCallback(() => {
    setIsEditing(false);
  }, []);

  const handleNameChange = useCallback(
    (value: string) => {
      // Empty name → revert to the formula-derived default so chart series
      // and legend labels always have a non-empty display name.
      onNameChange(value || expressionText);
      setIsEditing(false);
    },
    [onNameChange, expressionText],
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
        ml: 0,
        "aria-label": t`Remove expression`,
      }}
      onClick={handleClick}
      data-testid="metrics-viewer-search-pill"
    >
      <Flex align="center" gap="xs">
        <SourceColorIndicator colors={colors} />
        {isEditing || hasCustomName ? (
          <EditableText
            ref={editableRef}
            className={S.editableName}
            initialValue={expressionEntry.name}
            placeholder={expressionText}
            isEditing={isEditing}
            isOptional
            onChange={handleNameChange}
            onBlur={handleBlur}
            data-testid="expression-name-input"
          />
        ) : (
          <Flex align="center" gap={0}>
            {expressionForPill.map((segment, i) => {
              if (typeof segment === "number") {
                return (
                  <Badge
                    key={i}
                    circle
                    c="text-hover"
                    style={{ marginInlineStart: "0.2em" }}
                  >
                    {segment}
                  </Badge>
                );
              }
              return (
                <span key={i} className={S.expressionText}>
                  {segment}
                </span>
              );
            })}
            <span className={S.expressionText}>{"\u00a0"}</span>
          </Flex>
        )}
      </Flex>
    </Pill>
  );
}
