import cx from "classnames";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "ttag";

import { EditableText } from "metabase/common/components/EditableText";
import { SourceColorIndicator } from "metabase/common/components/SourceColorIndicator";
import { Badge, Flex, Icon, Menu, Pill } from "metabase/ui";

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
  const [menuOpened, setMenuOpened] = useState(false);
  const editableRef = useRef<HTMLDivElement>(null);

  const expressionText = useMemo(
    () => buildExpressionText(expressionEntry.tokens, metricNames),
    [expressionEntry.tokens, metricNames],
  );

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

  const handleRename = useCallback(() => {
    setMenuOpened(false);
    setIsEditing(true);
  }, []);

  const handleBlur = useCallback(() => {
    if (isEditing) {
      setMenuOpened(false);
      setIsEditing(false);
    }
  }, [isEditing]);

  const handleNameChange = useCallback(
    (value: string) => {
      // Empty name → revert to the formula-derived default so chart series
      // and legend labels always have a non-empty display name.
      onNameChange(value || expressionText);
      setMenuOpened(false);
      setIsEditing(false);
    },
    [onNameChange, expressionText],
  );

  return (
    <Menu
      opened={menuOpened}
      onChange={setMenuOpened}
      position="bottom-start"
      withinPortal
      disabled={isEditing}
    >
      <Menu.Target>
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
          data-testid="metrics-viewer-search-pill"
        >
          <Flex align="center" gap="xs">
            <SourceColorIndicator colors={colors} />
            {isEditing ? (
              <EditableText
                ref={editableRef}
                className={cx(
                  S.editableName,
                  isEditing && S.editableNameEditing,
                )}
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
                {expressionEntry.name ||
                  expressionForPill.map((segment, i) => {
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
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item leftSection={<Icon name="pencil" />} onClick={handleRename}>
          {t`Rename`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
