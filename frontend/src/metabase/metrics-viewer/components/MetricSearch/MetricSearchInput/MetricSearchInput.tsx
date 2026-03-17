import { EditorSelection } from "@codemirror/state";
import { keymap, placeholder } from "@codemirror/view";
import type { ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "ttag";

import { CodeMirror } from "metabase/common/components/CodeMirror";
import { Button, Flex, Icon, Popover, Tooltip } from "metabase/ui";
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
  validateExpression,
} from "../utils";

import S from "./MetricSearchInput.module.css";
import { operatorHighlight } from "./operatorHighlight";

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
  const [validationError, setValidationError] = useState<string | null>(null);

  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const pendingFocusRef = useRef(false);
  // lastCommittedText is the formula text from the last committed (run) query.
  // isDirty is computed by comparing editText to this value — no separate dirty state needed.
  const [lastCommittedText, setLastCommittedText] = useState("");
  const lastCommittedTextRef = useRef(lastCommittedText);
  lastCommittedTextRef.current = lastCommittedText;
  // Refs for reading latest values in callbacks without stale closures
  const editTextRef = useRef(editText);
  editTextRef.current = editText;
  const selectedMetricsRef = useRef(selectedMetrics);
  selectedMetricsRef.current = selectedMetrics;
  // Tracks whether an editing session is active. Set to true only once
  // handleInputFocus initializes the session; set back to false in commitAndCollapse.
  // Used to prevent autoFocus / view.focus() re-entrancy from reinitializing text.
  const isEditingSessionActiveRef = useRef(false);

  const handleRunRef = useRef<() => void>(() => {});

  // Dirty when the current edit text differs from the last committed text
  const isDirty = editText !== lastCommittedText;

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

  // Focus the editor after transitioning from collapsed → expanded mode
  useEffect(() => {
    if (isFocused && pendingFocusRef.current) {
      pendingFocusRef.current = false;
      editorRef.current?.view?.focus();
    }
  }, [isFocused]);

  const handleInputFocus = useCallback(() => {
    // If an editing session is already active (e.g. focus returning from a
    // dropdown item click via view.focus()), do not reset the text or the
    // committed baseline.
    if (isEditingSessionActiveRef.current) {
      return;
    }
    isEditingSessionActiveRef.current = true;
    const fullText = buildFullText(tokens, selectedMetrics);
    setIsFocused(true);
    setEditText(fullText);
    setLastCommittedText(fullText);
    setValidationError(null);
  }, [tokens, selectedMetrics]);

  /** Commits the current text: parses tokens, removes unreferenced metrics, and collapses. */
  const commitAndCollapse = useCallback(() => {
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
    isEditingSessionActiveRef.current = false;
    setIsFocused(false);
    setIsOpen(false);
    setCurrentWord("");
    setEditText("");
    setLastCommittedText("");
    setValidationError(null);
  }, [onRemoveMetric, onTokensChange]);

  const handleInputBlur = useCallback(() => {
    const currentTokens = parseFullText(
      editTextRef.current,
      selectedMetricsRef.current,
    );
    const error = validateExpression(currentTokens);
    if (error) {
      // Invalid formula — stay in focused/editing mode and show the error.
      // Do NOT close the dropdown here: if blur was caused by the user clicking
      // a dropdown item, the click must still fire so handleSelect can run.
      setValidationError(error);
      return;
    }
    setValidationError(null);
    commitAndCollapse();
  }, [commitAndCollapse]);

  const handleChange = useCallback(
    (newText: string) => {
      setEditText(newText);
      setValidationError(null);

      // Re-parse tokens from the updated text
      const newTokens = parseFullText(newText, selectedMetrics);
      onTokensChange(newTokens);

      // Extract the word at the cursor for the dropdown search
      const cursorPos =
        editorRef.current?.view?.state.selection.main.head ?? newText.length;
      const { word } = getWordAtCursor(newText, cursorPos);
      setCurrentWord(word);
      setIsOpen(true);
    },
    [selectedMetrics, onTokensChange],
  );

  const handleSelect = useCallback(
    (metric: SelectedMetric) => {
      const cursorPos =
        editorRef.current?.view?.state.selection.main.head ?? editText.length;
      const { start, end } = getWordAtCursor(editText, cursorPos);

      const metricName = metric.name ?? "";

      // Check if we need to auto-insert a separator before this metric.
      const textBeforeWord = editText.slice(0, start).trimEnd();
      const lastChar = textBeforeWord[textBeforeWord.length - 1];
      const NO_COMMA_CHARS = new Set(["+", "-", "*", "/", "(", ","]);
      const needsComma =
        textBeforeWord.length > 0 && !NO_COMMA_CHARS.has(lastChar);

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
        const view = editorRef.current?.view;
        if (view) {
          view.dispatch({
            selection: EditorSelection.cursor(newCursorPos),
          });
          view.focus();
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
    const view = editorRef.current?.view;
    if (view) {
      view.focus();
    } else {
      // Editor not rendered yet (collapsed mode) — transition to expanded
      pendingFocusRef.current = true;
      setIsFocused(true);
    }
  }, []);

  const handleEditorClick = useCallback(() => {
    const view = editorRef.current?.view;
    if (!view) {
      return;
    }
    // Re-extract word at the new cursor position after a click
    const cursorPos = view.state.selection.main.head;
    const text = view.state.doc.toString();
    const { word } = getWordAtCursor(text, cursorPos);
    setCurrentWord(word);
    setIsOpen(true);
  }, []);

  /** Validate the expression and either show an error or commit + run the query. */
  const handleRun = useCallback(() => {
    const currentTokens = parseFullText(
      editTextRef.current,
      selectedMetricsRef.current,
    );
    const error = validateExpression(currentTokens);
    if (error) {
      setValidationError(error);
      return;
    }
    setValidationError(null);
    commitAndCollapse();
  }, [commitAndCollapse]);
  handleRunRef.current = handleRun;

  // CodeMirror extensions for the formula editor
  const editorExtensions = useMemo(
    () => [
      operatorHighlight,
      placeholder(tokens.length === 0 ? t`Search for metrics...` : ""),
      // Prevent Enter from creating newlines; trigger run when dirty
      keymap.of([
        {
          key: "Enter",
          run: () => {
            handleRunRef.current();
            return true;
          },
        },
      ]),
    ],
    [tokens.length],
  );

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
      data-has-error={validationError ? true : undefined}
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
          // Focused: CodeMirror editor with syntax highlighting
          <Popover
            opened={isOpen}
            onChange={setIsOpen}
            position="bottom-start"
            shadow="md"
            withinPortal
          >
            <Popover.Target>
              <div
                className={S.codeEditor}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
                onClick={handleEditorClick}
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
      {validationError && (
        <Tooltip label={validationError} withinPortal>
          <Icon
            name="warning"
            color="error"
            aria-label={validationError}
            data-testid="expression-validation-icon"
          />
        </Tooltip>
      )}
      {isDirty && (
        <Button
          variant="filled"
          size="xs"
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
