import { history, isolateHistory, redo, undo } from "@codemirror/commands";
import { EditorSelection } from "@codemirror/state";
import { keymap, placeholder } from "@codemirror/view";
import type { ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "ttag";

import { CodeMirror } from "metabase/common/components/CodeMirror";
import { Button, Flex, Icon, Popover } from "metabase/ui";
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
  findInvalidRanges,
  getSelectedMeasureIds,
  getSelectedMetricIds,
  getWordAtCursor,
  parseFullText,
  removeUnmatchedParens,
  validateExpression,
} from "../utils";

import S from "./MetricSearchInput.module.css";
import { errorHighlight, setErrorDecoration } from "./errorHighlight";
import { metricTokenHighlight, setMetricEntries } from "./metricTokenHighlight";
import { operatorHighlight } from "./operatorHighlight";

// Metrics in the expression input can be used multiple times, so nothing is filtered out
const EMPTY_SET = new Set<number>();

type MetricSearchInputProps = {
  definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry>;
  formulaEntities: MetricsViewerFormulaEntity[];
  onFormulaEntitiesChange: (entities: MetricsViewerFormulaEntity[]) => void;
  selectedMetrics: SelectedMetric[];
  metricColors: SourceColorMap;
  onAddMetric: (metric: SelectedMetric) => void;
  onRemoveMetric: (metricId: number, sourceType: "metric" | "measure") => void;
  onSwapMetric: (oldMetric: SelectedMetric, newMetric: SelectedMetric) => void;
  onSetBreakout: (
    id: MetricSourceId,
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
  // editText is the full expression as plain text — only meaningful while focused
  const [editText, setEditText] = useState("");
  // currentWord is the word under the cursor, used as the dropdown search query
  const [currentWord, setCurrentWord] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  // Pixel position (viewport-relative) of the current word's left edge and
  // line bottom — used to anchor the search dropdown at the cursor word.
  const [anchorRect, setAnchorRect] = useState<{ left: number; top: number }>({
    left: 0,
    top: 0,
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const pendingFocusRef = useRef(false);
  // Refs for reading latest values in callbacks without stale closures
  const editTextRef = useRef(editText);
  editTextRef.current = editText;
  const formulaEntitiesRef = useRef(formulaEntities);
  formulaEntitiesRef.current = formulaEntities;
  const definitionsRef = useRef(definitions);
  definitionsRef.current = definitions;
  // Tracks whether an editing session is active. Set to true only once
  // handleInputFocus initializes the session; set back to false in commitAndCollapse.
  // Used to prevent autoFocus / view.focus() re-entrancy from reinitializing text.
  const isEditingSessionActiveRef = useRef(false);
  // Tracks whether the dropdown has a keyboard-highlighted item.
  // When true, Enter should select from the dropdown, not run the expression.
  const dropdownHasSelectionRef = useRef(false);

  const handleRunRef = useRef<() => void>(() => {});
  // Text captured at focus time — used to detect whether the user actually
  // changed the expression and therefore needs to click "Run" to commit.
  const [textAtFocus, setTextAtFocus] = useState("");
  const textAtFocusRef = useRef(textAtFocus);
  textAtFocusRef.current = textAtFocus;
  // Explicitly tracks whether the expression was modified during this editing
  // session (metric selected from dropdown, or text typed). Avoids timing
  // issues with comparing editText vs textAtFocus across async state updates.
  const [isExpressionDirty, setIsExpressionDirty] = useState(false);

  const metricEntries = useMemo(
    () =>
      Object.values(definitions).map(
        (e): MetricDefinitionEntry => ({ ...e, type: "metric" as const }),
      ),
    [definitions],
  );

  const metricEntriesRef = useRef(metricEntries);
  metricEntriesRef.current = metricEntries;

  // Clean up parens per expression entry (only when not actively editing)
  useEffect(() => {
    if (isFocused) {
      return;
    }
    let changed = false;
    const cleaned = formulaEntities.map((entry) => {
      if (!isExpressionEntry(entry)) {
        return entry;
      }
      const cleanedTokens = cleanupParens(removeUnmatchedParens(entry.tokens));
      if (cleanedTokens !== entry.tokens) {
        changed = true;
        return { ...entry, tokens: cleanedTokens };
      }
      return entry;
    });
    if (changed) {
      onFormulaEntitiesChange(cleaned);
    }
  }, [isFocused, formulaEntities, onFormulaEntitiesChange]);

  const selectedMetricIds = useMemo(
    () => getSelectedMetricIds(selectedMetrics),
    [selectedMetrics],
  );

  const selectedMeasureIds = useMemo(
    () => getSelectedMeasureIds(selectedMetrics),
    [selectedMetrics],
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
    const fullText = buildFullText(
      formulaEntitiesRef.current,
      definitionsRef.current,
    );
    setTextAtFocus(fullText);
    setIsFocused(true);
    setEditText(fullText);
    setValidationError(null);
    setIsExpressionDirty(false);
    // After CodeMirror renders the initial text, position the caret and
    // create an undo boundary. The @uiw/react-codemirror value sync adds
    // to the undo history, so without isolateHistory("before"), a quick
    // Cmd+Z after deleting a metric token would undo both the deletion
    // AND the initial text insertion (they'd be grouped together).
    setTimeout(() => {
      const view = editorRef.current?.view;
      if (view) {
        const endPos = view.state.doc.length;
        view.dispatch({
          selection: EditorSelection.cursor(endPos),
          effects: setMetricEntries.of(metricEntriesRef.current),
          annotations: isolateHistory.of("full"),
        });
        const coords = view.coordsAtPos(endPos);
        if (coords) {
          setAnchorRect({ left: coords.left, top: coords.bottom });
        }
      }
    }, 0);
  }, []);

  /** Commits the current text: parses formula entities, removes unreferenced metrics, and collapses. */
  const commitAndCollapse = useCallback(() => {
    const parsedEntities = parseFullText(
      editTextRef.current,
      metricEntriesRef.current,
    );

    // Find which metric sourceIds are referenced in the parsed entities
    const referencedSourceIds = new Set<MetricSourceId>();
    for (const entry of parsedEntities) {
      if (isMetricEntry(entry)) {
        referencedSourceIds.add(entry.id);
      } else if (isExpressionEntry(entry)) {
        for (const token of entry.tokens) {
          if (token.type === "metric") {
            referencedSourceIds.add(token.sourceId);
          }
        }
      }
    }

    // Remove unreferenced metrics from definitions
    for (const entry of Object.values(definitionsRef.current)) {
      if (!referencedSourceIds.has(entry.id)) {
        const metricId = selectedMetrics.find((m) => {
          const sid =
            m.sourceType === "metric"
              ? createMetricSourceId(m.id)
              : createMeasureSourceId(m.id);
          return sid === entry.id;
        });
        if (metricId) {
          onRemoveMetric(metricId.id, metricId.sourceType);
        }
      }
    }

    onFormulaEntitiesChange(parsedEntities);
    isEditingSessionActiveRef.current = false;
    setIsFocused(false);
    setIsOpen(false);
    setCurrentWord("");
    setEditText("");
    setValidationError(null);
    setIsExpressionDirty(false);
  }, [onRemoveMetric, onFormulaEntitiesChange, selectedMetrics]);

  const handleInputBlur = useCallback(() => {
    // If the text hasn't changed since focus, collapse back to pills view
    // without requiring the user to click "Run".
    if (
      editTextRef.current === textAtFocusRef.current &&
      !dropdownHasSelectionRef.current
    ) {
      isEditingSessionActiveRef.current = false;
      setIsFocused(false);
      setIsOpen(false);
      setCurrentWord("");
      setEditText("");
      setValidationError(null);
      setIsExpressionDirty(false);
      return;
    }

    // Text was modified — validate on blur but do NOT commit.
    // The expression is only executed when the user explicitly clicks "Run".
    const invalidRanges = findInvalidRanges(
      editTextRef.current,
      metricEntriesRef.current,
    );
    if (invalidRanges.length > 0) {
      setValidationError(invalidRanges[0].message);
      return;
    }

    const newEntities = parseFullText(
      editTextRef.current,
      metricEntriesRef.current,
    );
    // Validate each expression entry
    for (const entry of newEntities) {
      if (isExpressionEntry(entry)) {
        const error = validateExpression(entry.tokens);
        if (error) {
          setValidationError(error);
          return;
        }
      }
    }
    setValidationError(null);
  }, []);

  const handleChange = useCallback((newText: string) => {
    setEditText(newText);
    setValidationError(null);
    if (newText !== textAtFocusRef.current) {
      setIsExpressionDirty(true);
    }

    // Extract the word at the cursor for the dropdown search
    const view = editorRef.current?.view;
    const cursorPos = view?.state.selection.main.head ?? newText.length;
    const { word, start: wordStart } = getWordAtCursor(
      newText,
      cursorPos,
      metricEntriesRef.current,
    );
    // Anchor the dropdown at the word's left edge / line bottom in the viewport
    if (view) {
      const coords = view.coordsAtPos(wordStart);
      if (coords) {
        setAnchorRect({ left: coords.left, top: coords.bottom });
      }
    }
    setCurrentWord(word);
    setIsOpen(true);
  }, []);

  const handleSelect = useCallback(
    (metric: SelectedMetric) => {
      const cursorPos =
        editorRef.current?.view?.state.selection.main.head ?? editText.length;
      const { start, end } = getWordAtCursor(
        editText,
        cursorPos,
        metricEntriesRef.current,
      );

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
      setIsExpressionDirty(true);

      onAddMetric(metric);

      setCurrentWord("");
      setIsOpen(false);
      dropdownHasSelectionRef.current = false;

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
    [editText, onAddMetric],
  );

  // Remove one formula entity by index
  const handleRemoveItem = useCallback(
    (itemIndex: number) => {
      const removedEntry = formulaEntities[itemIndex];
      const newFormulaEntities = formulaEntities.filter(
        (_, i) => i !== itemIndex,
      );

      // Find sourceIds that were only referenced by the removed entry
      const removedSourceIds = new Set<MetricSourceId>();
      if (isMetricEntry(removedEntry)) {
        removedSourceIds.add(removedEntry.id);
      } else if (isExpressionEntry(removedEntry)) {
        for (const token of removedEntry.tokens) {
          if (token.type === "metric") {
            removedSourceIds.add(token.sourceId);
          }
        }
      }

      // Check if any of those sourceIds are still referenced
      const stillReferenced = new Set<MetricSourceId>();
      for (const entry of newFormulaEntities) {
        if (isMetricEntry(entry)) {
          stillReferenced.add(entry.id);
        } else if (isExpressionEntry(entry)) {
          for (const token of entry.tokens) {
            if (token.type === "metric") {
              stillReferenced.add(token.sourceId);
            }
          }
        }
      }

      // Remove unreferenced metrics from definitions
      for (const sourceId of removedSourceIds) {
        if (!stillReferenced.has(sourceId)) {
          const metric = selectedMetrics.find((m) => {
            const sid =
              m.sourceType === "metric"
                ? createMetricSourceId(m.id)
                : createMeasureSourceId(m.id);
            return sid === sourceId;
          });
          if (metric) {
            onRemoveMetric(metric.id, metric.sourceType);
          }
        }
      }

      onFormulaEntitiesChange(newFormulaEntities);
    },
    [formulaEntities, selectedMetrics, onRemoveMetric, onFormulaEntitiesChange],
  );

  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    // Ignore clicks originating from portal-rendered content (e.g. context
    // menus, breakout pickers).  These fire "click outside" on the container
    // but should not switch the input into text-editing mode.
    if (
      containerRef.current &&
      e.target instanceof Node &&
      !containerRef.current.contains(e.target)
    ) {
      return;
    }
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
    const { word, start: wordStart } = getWordAtCursor(
      text,
      cursorPos,
      metricEntriesRef.current,
    );
    // Update the anchor position so the dropdown is correctly placed
    const coords = view.coordsAtPos(wordStart);
    if (coords) {
      setAnchorRect({ left: coords.left, top: coords.bottom });
    }
    setCurrentWord(word);
    setIsOpen(true);
  }, []);

  const handleDropdownHasSelectionChange = useCallback(
    (hasSelection: boolean) => {
      dropdownHasSelectionRef.current = hasSelection;
    },
    [],
  );

  /** Validate the expression and either show an error or commit + run the query. */
  const handleRun = useCallback(() => {
    // Check for unknown / invalid tokens in the raw text first, before
    // parseFullText strips them.  This catches trailing junk like "!!!"
    // that would otherwise be silently dropped.
    const invalidRanges = findInvalidRanges(
      editTextRef.current,
      metricEntriesRef.current,
    );
    if (invalidRanges.length > 0) {
      setValidationError(invalidRanges[0].message);
      return;
    }

    const newEntities = parseFullText(
      editTextRef.current,
      metricEntriesRef.current,
    );
    // Validate each expression entry
    for (const entry of newEntities) {
      if (isExpressionEntry(entry)) {
        const error = validateExpression(entry.tokens);
        if (error) {
          setValidationError(error);
          return;
        }
      }
    }
    setValidationError(null);
    commitAndCollapse();
  }, [commitAndCollapse]);
  handleRunRef.current = handleRun;

  // Sync validation error into the CodeMirror decoration field
  useEffect(() => {
    const view = editorRef.current?.view;
    if (!view) {
      return;
    }
    const ranges =
      validationError !== null
        ? findInvalidRanges(editTextRef.current, metricEntriesRef.current)
        : [];
    view.dispatch({ effects: setErrorDecoration.of(ranges) });
  }, [validationError]);

  // Sync metric entries into the CodeMirror state for atomic token ranges
  useEffect(() => {
    const view = editorRef.current?.view;
    if (!view || !isFocused) {
      return;
    }
    view.dispatch({ effects: setMetricEntries.of(metricEntries) });
  }, [metricEntries, isFocused]);

  // CodeMirror extensions for the formula editor.
  // basicSetup is disabled, so we add history() explicitly for undo/redo.
  const editorExtensions = useMemo(
    () => [
      history(),
      operatorHighlight,
      errorHighlight,
      metricTokenHighlight,
      placeholder(formulaEntities.length === 0 ? t`Search for metrics...` : ""),
      // Prevent Enter from creating newlines; trigger run when dirty.
      // If the dropdown has a keyboard-highlighted item, skip running —
      // let the dropdown's Enter handler select the item instead.
      keymap.of([
        { key: "Mod-z", run: undo, preventDefault: true },
        { key: "Mod-Shift-z", run: redo, preventDefault: true },
        {
          key: "Enter",
          run: () => {
            if (!dropdownHasSelectionRef.current) {
              handleRunRef.current();
            }
            return true;
          },
        },
      ]),
    ],
    [formulaEntities.length],
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
                const defEntry = definitions[entry.id];
                return (
                  <span key={`${entry.id}-${entryIndex}`}>
                    <MetricPill
                      metric={metric}
                      colors={metricColors[entry.id]}
                      definitionEntry={
                        defEntry
                          ? { ...defEntry, type: "metric" as const }
                          : entry
                      }
                      selectedMetricIds={selectedMetricIds}
                      selectedMeasureIds={selectedMeasureIds}
                      onSwap={onSwapMetric}
                      onRemove={(_id, _sourceType) =>
                        handleRemoveItem(entryIndex)
                      }
                      onSetBreakout={(dimension) =>
                        onSetBreakout(entry.id, dimension)
                      }
                    />
                  </span>
                );
              }

              if (isExpressionEntry(entry)) {
                // One primary color per unique metric in the expression
                const expressionColors = (() => {
                  const seen = new Set<string>();
                  const result: string[] = [];
                  for (const tok of entry.tokens) {
                    if (tok.type !== "metric") {
                      continue;
                    }
                    const key = String(tok.sourceId);
                    if (!seen.has(key)) {
                      seen.add(key);
                      const color = metricColors[tok.sourceId]?.[0];
                      if (color !== undefined) {
                        result.push(color);
                      }
                    }
                  }
                  return result.length > 0 ? result : undefined;
                })();

                return (
                  <span key={`${entry.id}-${entryIndex}`}>
                    <MetricExpressionPill
                      expressionText={buildExpressionText(
                        entry.tokens,
                        metricEntries,
                      )}
                      colors={expressionColors}
                      onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        pendingFocusRef.current = true;
                        setIsFocused(true);
                      }}
                      onRemove={() => handleRemoveItem(entryIndex)}
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
            <Popover
              opened={isOpen}
              onChange={setIsOpen}
              position="bottom-start"
              shadow="md"
              withinPortal
            >
              <Popover.Target>
                <span
                  aria-hidden
                  style={{
                    position: "fixed",
                    left: anchorRect.left,
                    top: anchorRect.top,
                    width: 0,
                    height: 0,
                    pointerEvents: "none",
                  }}
                />
              </Popover.Target>
              <Popover.Dropdown
                p={0}
                miw="19rem"
                maw="25rem"
                onMouseDown={(e) => e.preventDefault()}
              >
                {isOpen && (
                  <MetricSearchDropdown
                    selectedMetricIds={EMPTY_SET}
                    selectedMeasureIds={EMPTY_SET}
                    onSelect={handleSelect}
                    externalSearchText={currentWord}
                    onHasSelectionChange={handleDropdownHasSelectionChange}
                  />
                )}
              </Popover.Dropdown>
            </Popover>
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
