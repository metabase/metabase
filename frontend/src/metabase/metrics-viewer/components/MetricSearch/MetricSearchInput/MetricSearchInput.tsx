import type { ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { useMemo, useRef } from "react";
import { t } from "ttag";

import { CodeMirror } from "metabase/common/components/CodeMirror";
import { Button, Flex, Icon } from "metabase/ui";
import type { ProjectionClause } from "metabase-lib/metric";

import type {
  MetricDefinitionEntry,
  MetricSourceId,
  MetricsViewerDefinitionEntry,
  MetricsViewerFormulaEntity,
  SelectedMetric,
  SourceColorMap,
} from "../../../types/viewer-state";
import { isExpressionEntry, isMetricEntry } from "../../../types/viewer-state";
import { getEffectiveDefinitionEntry } from "../../../utils/definition-entries";
import {
  createMeasureSourceId,
  createMetricSourceId,
} from "../../../utils/source-ids";
import { MetricExpressionPill } from "../MetricExpressionPill";
import { MetricPill } from "../MetricPill";
import {
  MetricSearchDropdown,
  type MetricSearchDropdownRef,
} from "../MetricSearchDropdown";

import S from "./MetricSearchInput.module.css";
import { buildEditorExtensions } from "./editorExtensions";
import { useFormulaEditor } from "./useFormulaEditor";
import { useMetricNameTracking } from "./useMetricNameTracking";

type MetricSearchInputProps = {
  definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry>;
  formulaEntities: MetricsViewerFormulaEntity[];
  onFormulaEntitiesChange: (
    entities: MetricsViewerFormulaEntity[],
    slotMapping?: Map<number, number>,
  ) => void;
  selectedMetrics: SelectedMetric[];
  metricColors: SourceColorMap;
  onAddMetric: (metric: SelectedMetric) => void;
  onRemoveMetric: (metricId: number, sourceType: "metric" | "measure") => void;
  onSwapMetric: (oldMetric: SelectedMetric, newMetric: SelectedMetric) => void;
  onSetBreakout: (
    entity: MetricDefinitionEntry,
    dimension: ProjectionClause | undefined,
  ) => void;
};

export function MetricSearchInput({
  definitions,
  formulaEntities,
  onFormulaEntitiesChange,
  selectedMetrics,
  metricColors,
  onAddMetric,
  onRemoveMetric,
  onSwapMetric,
  onSetBreakout,
}: MetricSearchInputProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const dropdownRef = useRef<MetricSearchDropdownRef>(null);

  const {
    metricNames,
    metricNamesRef,
    handleAddMetric,
    handleRemoveMetric,
    handleSwapMetric,
    setSearchMetricNames,
  } = useMetricNameTracking({
    definitions,
    onAddMetric,
    onRemoveMetric,
    onSwapMetric,
  });

  const {
    editText,
    isFocused,
    isOpen,
    setIsOpen,
    currentWord,
    validationError,
    anchorRect,
    isExpressionDirty,
    pendingFocusRef,
    handleInputFocus,
    handleInputBlur,
    handleEditExpression,
    handleChange,
    handleSelect,
    handleRemoveItem,
    handleContainerClick,
    handleEditorClick,
    handleEditorKeyDown,
    handleRun,
    handleRunRef,
  } = useFormulaEditor({
    formulaEntities,
    onFormulaEntitiesChange,
    selectedMetrics,
    definitions,
    metricNamesRef,
    handleAddMetric,
    handleRemoveMetric,
    editorRef,
    containerRef,
    dropdownRef,
  });

  const editorExtensions = useMemo(
    () =>
      buildEditorExtensions(formulaEntities.length, {
        handleRunRef,
        dropdownRef,
      }),
    [formulaEntities.length, handleRunRef, dropdownRef],
  );

  const isCollapsed = !isFocused && formulaEntities.length > 0;

  return (
    <Flex
      ref={containerRef}
      className={S.inputWrapper}
      bg="background-primary"
      align="center"
      gap="sm"
      px="sm"
      py="xs"
      onClick={handleContainerClick}
      data-has-error={validationError ? true : undefined}
      data-testid="metrics-formula-input"
    >
      <Flex align="center" gap="sm" flex={1} wrap="wrap" mih="2.375rem">
        {isCollapsed ? (
          // Unfocused: each formula entity rendered as MetricPill or MetricExpressionPill
          <>
            {formulaEntities.map((entry, entryIndex) => {
              if (isMetricEntry(entry)) {
                const metric = selectedMetrics.find((m) => {
                  const sid =
                    m.sourceType === "metric"
                      ? createMetricSourceId(m.id)
                      : createMeasureSourceId(m.id);
                  return sid === entry.id;
                });
                if (!metric) {
                  return null;
                }
                const definition = getEffectiveDefinitionEntry(
                  entry,
                  definitions,
                );
                return (
                  <span key={`${entry.id}-${entryIndex}`}>
                    <MetricPill
                      metric={metric}
                      colors={metricColors[entryIndex]}
                      definitionEntry={definition}
                      onSwap={handleSwapMetric}
                      onRemove={(_id, _sourceType) =>
                        handleRemoveItem(entryIndex)
                      }
                      onSetBreakout={(dimension) =>
                        onSetBreakout(entry, dimension)
                      }
                    />
                  </span>
                );
              }

              if (isExpressionEntry(entry)) {
                const expressionColors = metricColors[entryIndex]
                  ? [metricColors[entryIndex][0]]
                  : undefined;

                return (
                  <span
                    key={`${entry.id}-${entryIndex}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MetricExpressionPill
                      expressionEntry={entry}
                      metricNames={metricNames}
                      colors={expressionColors}
                      onNameChange={(newName) => {
                        const updated = [...formulaEntities];
                        updated[entryIndex] = { ...entry, name: newName };
                        onFormulaEntitiesChange(updated);
                      }}
                      onRemove={() => handleRemoveItem(entryIndex)}
                      onEdit={() => handleEditExpression(entryIndex)}
                    />
                  </span>
                );
              }

              return null;
            })}
          </>
        ) : (
          // Focused: CodeMirror editor with syntax highlighting.
          // The Popover is anchored to a zero-size fixed span that tracks the
          // viewport position of the word under the cursor, so the dropdown
          // appears directly below the current word rather than the full input.
          <>
            <div
              className={S.codeEditor}
              onFocus={handleInputFocus}
              onBlur={handleInputBlur}
              onClick={handleEditorClick}
              onKeyDown={handleEditorKeyDown}
            >
              <CodeMirror
                ref={editorRef}
                basicSetup={false}
                autoFocus
                value={editText}
                onChange={handleChange}
                extensions={editorExtensions}
                data-testid="metrics-viewer-search-input"
              />
            </div>
            {isOpen && (
              <MetricSearchDropdown
                anchorRect={anchorRect}
                onSelect={handleSelect}
                externalSearchText={currentWord}
                onClose={() => setIsOpen(false)}
                ref={dropdownRef}
                setSearchMetricNames={setSearchMetricNames}
              />
            )}
          </>
        )}
      </Flex>
      {isFocused && !pendingFocusRef.current && isExpressionDirty && (
        <Button
          variant="light"
          color="brand"
          size="xs"
          py="sm"
          px="sm"
          leftSection={<Icon size="0.75rem" name="enter_or_return" />}
          disabled={!!validationError}
          data-testid="run-expression-button"
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            handleRun();
          }}
        >{t`Run`}</Button>
      )}
    </Flex>
  );
}
