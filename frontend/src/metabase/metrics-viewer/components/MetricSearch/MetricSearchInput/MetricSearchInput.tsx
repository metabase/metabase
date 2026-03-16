import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "ttag";

import { Flex, Popover, TextInput } from "metabase/ui";
import type { ProjectionClause } from "metabase-lib/metric";

import type { ExpressionToken } from "../../../types/operators";
import type {
  MetricSourceId,
  MetricsViewerDefinitionEntry,
  SelectedMetric,
  SourceColorMap,
} from "../../../types/viewer-state";
import {
  createMeasureSourceId,
  createMetricSourceId,
} from "../../../utils/source-ids";
import { MetricExpressionPill } from "../MetricExpressionPill";
import { MetricPill } from "../MetricPill";
import { MetricSearchDropdown } from "../MetricSearchDropdown";
import {
  buildExpressionText,
  buildFullText,
  cleanupParens,
  cleanupSeparators,
  getSelectedMeasureIds,
  getSelectedMetricIds,
  getWordAtCursor,
  parseFullText,
  removeUnmatchedParens,
  splitByItems,
} from "../utils";

import S from "./MetricSearchInput.module.css";

// Metrics in the expression input can be used multiple times, so nothing is filtered out
const EMPTY_SET = new Set<number>();

type MetricSearchInputProps = {
  tokens: ExpressionToken[];
  onTokensChange: (tokens: ExpressionToken[]) => void;
  selectedMetrics: SelectedMetric[];
  metricColors: SourceColorMap;
  definitions: MetricsViewerDefinitionEntry[];
  onAddMetric: (metric: SelectedMetric) => void;
  onRemoveMetric: (metricId: number, sourceType: "metric" | "measure") => void;
  onSwapMetric: (oldMetric: SelectedMetric, newMetric: SelectedMetric) => void;
  onSetBreakout: (
    id: MetricSourceId,
    dimension: ProjectionClause | undefined,
  ) => void;
};

export function MetricSearchInput({
  tokens,
  onTokensChange,
  selectedMetrics,
  metricColors,
  definitions,
  onAddMetric,
  onRemoveMetric,
  onSwapMetric,
  onSetBreakout,
}: MetricSearchInputProps) {
  // editText is the full expression as plain text — only meaningful while focused
  const [editText, setEditText] = useState("");
  // currentWord is the word under the cursor, used as the dropdown search query
  const [currentWord, setCurrentWord] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const pendingFocusRef = useRef(false);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Refs so blur timeout can read latest values without stale closures
  const editTextRef = useRef(editText);
  editTextRef.current = editText;
  const selectedMetricsRef = useRef(selectedMetrics);
  selectedMetricsRef.current = selectedMetrics;

  // Remove unnecessary parentheses per item (only when not actively editing)
  useEffect(() => {
    if (isFocused) {
      return;
    }
    const allItems = splitByItems(tokens);
    const cleanedItems = allItems.map((item) =>
      cleanupParens(removeUnmatchedParens(item)),
    );
    if (cleanedItems.some((item, i) => item !== allItems[i])) {
      const newTokens = cleanedItems.flatMap((item, i) =>
        i < cleanedItems.length - 1
          ? [...item, { type: "separator" as const }]
          : item,
      );
      onTokensChange(newTokens);
    }
  }, [isFocused, tokens, onTokensChange]);

  // Remove empty items (trailing / consecutive separators) when not focused
  useEffect(() => {
    if (!isFocused) {
      const cleaned = cleanupSeparators(tokens);
      if (cleaned.length !== tokens.length) {
        onTokensChange(cleaned);
      }
    }
  }, [isFocused, tokens, onTokensChange]);

  // Safety net: drop out-of-range metric tokens (only when not editing)
  useEffect(() => {
    if (isFocused) {
      return;
    }
    const maxIdx = selectedMetrics.length - 1;
    const filtered = tokens.filter(
      (t) => t.type !== "metric" || t.metricIndex <= maxIdx,
    );
    if (filtered.length !== tokens.length) {
      onTokensChange(filtered);
    }
  }, [isFocused, selectedMetrics.length, tokens, onTokensChange]);

  // Split tokens into items for the collapsed (pill) view
  const items = useMemo(() => splitByItems(tokens), [tokens]);

  const selectedMetricIds = useMemo(
    () => getSelectedMetricIds(selectedMetrics),
    [selectedMetrics],
  );

  const selectedMeasureIds = useMemo(
    () => getSelectedMeasureIds(selectedMetrics),
    [selectedMetrics],
  );

  const definitionsBySourceId = useMemo(
    () => new Map(definitions.map((entry) => [entry.id, entry] as const)),
    [definitions],
  );

  // Focus the input after transitioning from collapsed → expanded mode
  useEffect(() => {
    if (isFocused && pendingFocusRef.current) {
      pendingFocusRef.current = false;
      inputRef.current?.focus();
    }
  }, [isFocused]);

  const handleInputFocus = useCallback(() => {
    if (blurTimeoutRef.current !== null) {
      // Re-focused before the blur timeout fired — cancel and keep current text
      clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
      setIsFocused(true);
      return;
    }
    setIsFocused(true);
    setEditText(buildFullText(tokens, selectedMetrics));
  }, [tokens, selectedMetrics]);

  const handleInputBlur = useCallback(() => {
    blurTimeoutRef.current = setTimeout(() => {
      blurTimeoutRef.current = null;

      // Parse the final text and sync tokens, removing unreferenced metrics
      const finalTokens = parseFullText(
        editTextRef.current,
        selectedMetricsRef.current,
      );

      const referencedIndices = new Set(
        finalTokens
          .filter(
            (t): t is { type: "metric"; metricIndex: number } =>
              t.type === "metric",
          )
          .map((t) => t.metricIndex),
      );

      // Remove unreferenced metrics, highest index first to keep indices valid
      let remappedTokens = [...finalTokens];
      const toRemove = selectedMetricsRef.current
        .map((_, idx) => idx)
        .filter((idx) => !referencedIndices.has(idx))
        .sort((a, b) => b - a);

      for (const removeIdx of toRemove) {
        remappedTokens = remappedTokens.map((t) =>
          t.type === "metric" && t.metricIndex > removeIdx
            ? { ...t, metricIndex: t.metricIndex - 1 }
            : t,
        );
        const metric = selectedMetricsRef.current[removeIdx];
        if (metric) {
          onRemoveMetric(metric.id, metric.sourceType);
        }
      }

      onTokensChange(remappedTokens);
      setIsFocused(false);
      setIsOpen(false);
      setCurrentWord("");
      setEditText("");
    }, 150);
  }, [onRemoveMetric, onTokensChange]);

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const newText = event.target.value;
      setEditText(newText);

      // Re-parse tokens from the updated text
      const newTokens = parseFullText(newText, selectedMetrics);
      onTokensChange(newTokens);

      // Extract the word at the cursor for the dropdown search
      const cursorPos = event.target.selectionStart ?? newText.length;
      const { word } = getWordAtCursor(newText, cursorPos);
      setCurrentWord(word);
      setIsOpen(true);
    },
    [selectedMetrics, onTokensChange],
  );

  const handleSelect = useCallback(
    (metric: SelectedMetric) => {
      const cursorPos = inputRef.current?.selectionStart ?? editText.length;
      const { start, end } = getWordAtCursor(editText, cursorPos);

      const metricName = metric.name ?? "";

      // Check if we need to auto-insert a separator before this metric.
      // A comma is needed when the preceding content ends with something that
      // is not an operator, open-paren, comma, or nothing — i.e. another metric
      // name or a close-paren would make the new metric ambiguously part of the
      // same expression without an operator.
      const textBeforeWord = editText.slice(0, start).trimEnd();
      const lastChar = textBeforeWord[textBeforeWord.length - 1];
      const NO_COMMA_CHARS = new Set(["+", "-", "*", "/", "(", ","]);
      const needsComma =
        textBeforeWord.length > 0 && !NO_COMMA_CHARS.has(lastChar);

      // Build the new text.
      // • comma case: trim trailing whitespace from the text before the word,
      //   then insert ", " so we don't get "Metric  , NewMetric".
      // • no-comma case: use the original (untrimmed) slice so any deliberate
      //   spacing between an operator and the metric is preserved (e.g. the " "
      //   in "Revenue + " stays, giving "Revenue + Costs" not "Revenue +Costs").
      let newText: string;
      let newCursorPos: number;
      if (needsComma) {
        newText = textBeforeWord + ", " + metricName + editText.slice(end);
        newCursorPos = textBeforeWord.length + 2 + metricName.length;
      } else {
        newText = editText.slice(0, start) + metricName + editText.slice(end);
        newCursorPos = start + metricName.length;
      }

      setEditText(newText);

      onAddMetric(metric);

      // Compute the optimistic updated metrics list so we can parse immediately
      const existingIndex = selectedMetrics.findIndex(
        (m) => m.id === metric.id && m.sourceType === metric.sourceType,
      );
      const updatedMetrics =
        existingIndex !== -1 ? selectedMetrics : [...selectedMetrics, metric];

      const newTokens = parseFullText(newText, updatedMetrics);
      onTokensChange(newTokens);

      setCurrentWord("");
      setIsOpen(false);

      // Reposition cursor right after the inserted metric name
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
          inputRef.current.focus();
        }
      }, 0);
    },
    [editText, selectedMetrics, onAddMetric, onTokensChange],
  );

  // Remove one item (pill) by index
  const handleRemoveItem = useCallback(
    (itemIndex: number) => {
      const allItems = splitByItems(tokens);
      const removedItemTokens = allItems[itemIndex];

      const removedIndices = new Set(
        removedItemTokens
          .filter(
            (t): t is { type: "metric"; metricIndex: number } =>
              t.type === "metric",
          )
          .map((t) => t.metricIndex),
      );

      const remainingItems = allItems.filter((_, i) => i !== itemIndex);
      let newTokens: ExpressionToken[] = remainingItems.flatMap((item, i) =>
        i < remainingItems.length - 1
          ? [...item, { type: "separator" as const }]
          : item,
      );

      const stillReferenced = new Set(
        newTokens
          .filter(
            (t): t is { type: "metric"; metricIndex: number } =>
              t.type === "metric",
          )
          .map((t) => t.metricIndex),
      );

      const toRemove = [...removedIndices]
        .filter((idx) => !stillReferenced.has(idx))
        .sort((a, b) => b - a);

      for (const removeIdx of toRemove) {
        newTokens = newTokens.map((t) =>
          t.type === "metric" && t.metricIndex > removeIdx
            ? { ...t, metricIndex: t.metricIndex - 1 }
            : t,
        );
        const metric = selectedMetrics[removeIdx];
        if (metric) {
          onRemoveMetric(metric.id, metric.sourceType);
        }
      }

      onTokensChange(newTokens);
    },
    [tokens, selectedMetrics, onRemoveMetric, onTokensChange],
  );

  const handleContainerClick = useCallback(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    } else {
      // TextInput not rendered yet (collapsed mode) — transition to expanded
      pendingFocusRef.current = true;
      setIsFocused(true);
    }
  }, []);

  const handleInputClick = useCallback(() => {
    if (!inputRef.current) {
      return;
    }
    // Re-extract word at the new cursor position after a click
    const cursorPos = inputRef.current.selectionStart ?? editText.length;
    const { word } = getWordAtCursor(editText, cursorPos);
    setCurrentWord(word);
    setIsOpen(true);
  }, [editText]);

  const isCollapsed = !isFocused && tokens.length > 0;

  return (
    <Flex
      className={S.inputWrapper}
      bg="background-primary"
      align="center"
      gap="sm"
      px="sm"
      py="xs"
      onClick={handleContainerClick}
    >
      <Flex align="center" gap="sm" flex={1} wrap="wrap" mih="2.375rem">
        {isCollapsed ? (
          // Unfocused: each item rendered as MetricPill or MetricExpressionPill
          <>
            {items.map((itemTokens, itemIndex) => {
              const isSingleMetric =
                itemTokens.length === 1 && itemTokens[0].type === "metric";

              const pill = isSingleMetric
                ? (() => {
                    const token = itemTokens[0];
                    if (token.type !== "metric") {
                      return null;
                    }
                    const metric = selectedMetrics[token.metricIndex];
                    if (!metric) {
                      return null;
                    }
                    const sid =
                      metric.sourceType === "metric"
                        ? createMetricSourceId(metric.id)
                        : createMeasureSourceId(metric.id);
                    const entry = definitionsBySourceId.get(sid);
                    if (!entry) {
                      return null;
                    }
                    return (
                      <MetricPill
                        metric={metric}
                        colors={metricColors[sid]}
                        definitionEntry={entry}
                        selectedMetricIds={selectedMetricIds}
                        selectedMeasureIds={selectedMeasureIds}
                        onSwap={onSwapMetric}
                        onRemove={(_id, _sourceType) =>
                          handleRemoveItem(itemIndex)
                        }
                        onSetBreakout={(dimension) =>
                          onSetBreakout(sid, dimension)
                        }
                      />
                    );
                  })()
                : (() => {
                    // Use the first color of the first metric as the single
                    // series color (the expression result is one chart series)
                    const firstMetricToken = itemTokens.find(
                      (t): t is { type: "metric"; metricIndex: number } =>
                        t.type === "metric",
                    );
                    const firstMetric =
                      firstMetricToken !== undefined
                        ? selectedMetrics[firstMetricToken.metricIndex]
                        : undefined;
                    const expressionColor =
                      firstMetric !== undefined
                        ? metricColors[
                            firstMetric.sourceType === "metric"
                              ? createMetricSourceId(firstMetric.id)
                              : createMeasureSourceId(firstMetric.id)
                          ]?.[0]
                        : undefined;

                    return (
                      <MetricExpressionPill
                        expressionText={buildExpressionText(
                          itemTokens,
                          selectedMetrics,
                        )}
                        color={expressionColor}
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                          pendingFocusRef.current = true;
                          setIsFocused(true);
                        }}
                        onRemove={() => handleRemoveItem(itemIndex)}
                      />
                    );
                  })();

              return <span key={itemIndex}>{pill}</span>;
            })}
          </>
        ) : (
          // Focused: single text input showing the full expression
          <Popover
            opened={isOpen}
            onChange={setIsOpen}
            position="bottom-start"
            shadow="md"
            withinPortal
          >
            <Popover.Target>
              <TextInput
                ref={inputRef}
                classNames={{ input: S.inputField }}
                flex={1}
                miw="7.5rem"
                variant="unstyled"
                placeholder={
                  tokens.length === 0 ? t`Search for metrics...` : ""
                }
                value={editText}
                onChange={handleChange}
                onClick={handleInputClick}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
                data-testid="metrics-viewer-search-input"
              />
            </Popover.Target>
            <Popover.Dropdown p={0} miw="19rem" maw="25rem">
              {isOpen && (
                <MetricSearchDropdown
                  selectedMetricIds={EMPTY_SET}
                  selectedMeasureIds={EMPTY_SET}
                  onSelect={handleSelect}
                  externalSearchText={currentWord}
                />
              )}
            </Popover.Dropdown>
          </Popover>
        )}
      </Flex>
    </Flex>
  );
}
