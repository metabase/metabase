import { isolateHistory } from "@codemirror/commands";
import { EditorSelection } from "@codemirror/state";
import type { ReactCodeMirrorRef } from "@uiw/react-codemirror";
import type { MutableRefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import type {
  MetricSourceId,
  MetricsViewerDefinitionEntry,
  MetricsViewerFormulaEntity,
  SelectedMetric,
} from "../../../types/viewer-state";
import { isExpressionEntry, isMetricEntry } from "../../../types/viewer-state";
import { computeMetricSlots } from "../../../utils/metric-slots";
import {
  createMeasureSourceId,
  createMetricSourceId,
} from "../../../utils/source-ids";
import {
  type MetricNameMap,
  applyTrackedDefinitions,
  buildFullText,
  cleanupParens,
  findInvalidRanges,
  getWordAtCursor,
  parseFullText,
  removeUnmatchedParens,
} from "../utils";

import { setErrorDecoration } from "./errorHighlight";
import {
  buildMetricIdentities,
  readMetricIdentities,
  setMetricIdentities,
  setMetricNames,
} from "./metricTokenHighlight";

type UseFormulaEditorParams = {
  formulaEntities: MetricsViewerFormulaEntity[];
  onFormulaEntitiesChange: (
    entities: MetricsViewerFormulaEntity[],
    slotMapping?: Map<number, number>,
  ) => void;
  selectedMetrics: SelectedMetric[];
  definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry>;
  metricNames: MetricNameMap;
  metricNamesRef: MutableRefObject<MetricNameMap>;
  handleAddMetric: (metric: SelectedMetric) => void;
  handleRemoveMetric: (
    metricId: number,
    sourceType: "metric" | "measure",
  ) => void;
  editorRef: React.RefObject<ReactCodeMirrorRef | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
};

export type UseFormulaEditorResult = {
  editText: string;
  isFocused: boolean;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  currentWord: string;
  validationError: string | null;
  anchorRect: { left: number; top: number };
  isExpressionDirty: boolean;
  pendingFocusRef: MutableRefObject<boolean>;
  handleInputFocus: () => void;
  handleInputBlur: () => void;
  handleChange: (newText: string) => void;
  handleSelect: (metric: SelectedMetric) => void;
  handleRemoveItem: (itemIndex: number) => void;
  handleContainerClick: (e: React.MouseEvent) => void;
  handleEditorClick: () => void;
  handleEditorKeyDown: (e: React.KeyboardEvent) => void;
  handleDropdownHasSelectionChange: (hasSelection: boolean) => void;
  handleRun: () => void;
  // Refs needed by editorExtensions builder
  handleRunRef: MutableRefObject<() => void>;
  isOpenRef: MutableRefObject<boolean>;
  dropdownHasSelectionRef: MutableRefObject<boolean>;
};

export function useFormulaEditor({
  formulaEntities,
  onFormulaEntitiesChange,
  selectedMetrics,
  definitions,
  metricNames,
  metricNamesRef,
  handleAddMetric,
  handleRemoveMetric,
  editorRef,
  containerRef,
}: UseFormulaEditorParams): UseFormulaEditorResult {
  // editText is the full expression as plain text — only meaningful while focused
  const [editText, setEditText] = useState("");
  // currentWord is the word under the cursor, used as the dropdown search query
  const [currentWord, setCurrentWord] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;
  const [isFocused, setIsFocused] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  // Pixel position (viewport-relative) of the current word's left edge and
  // line bottom — used to anchor the search dropdown at the cursor word.
  const [anchorRect, setAnchorRect] = useState<{ left: number; top: number }>({
    left: 0,
    top: 0,
  });

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

  // Focus the editor after transitioning from collapsed → expanded mode
  useEffect(() => {
    if (isFocused && pendingFocusRef.current) {
      pendingFocusRef.current = false;
      editorRef.current?.view?.focus();
    }
  }, [isFocused, editorRef]);

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
      metricNamesRef.current,
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
        const identities = buildMetricIdentities(
          fullText,
          metricNamesRef.current,
          formulaEntitiesRef.current,
        );
        view.dispatch({
          selection: EditorSelection.cursor(endPos),
          effects: [
            setMetricNames.of(metricNamesRef.current),
            setMetricIdentities.of(identities),
          ],
          annotations: isolateHistory.of("full"),
        });
        const coords = view.coordsAtPos(endPos);
        if (coords) {
          setAnchorRect({ left: coords.left, top: coords.bottom });
        }
      }
    }, 0);
  }, [editorRef, metricNamesRef]);

  /** Commits the current text: parses formula entities, removes unreferenced metrics, and collapses. */
  const commitAndCollapse = useCallback(() => {
    const newText = editTextRef.current;
    const parsedEntities = parseFullText(newText, metricNamesRef.current);

    // Read tracked identities from the CodeMirror StateField —
    // positions are already mapped through all edits automatically.
    const view = editorRef.current?.view;
    const trackedIdentities = view ? readMetricIdentities(view) : [];

    const { entities: reconciledEntities, slotMapping } =
      applyTrackedDefinitions(
        parsedEntities,
        trackedIdentities,
        newText,
        metricNamesRef.current,
      );

    // Find which metric sourceIds are referenced in the parsed entities
    const referencedSourceIds = new Set<MetricSourceId>();
    for (const entry of reconciledEntities) {
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
          handleRemoveMetric(metricId.id, metricId.sourceType);
        }
      }
    }

    onFormulaEntitiesChange(reconciledEntities, slotMapping);
    isEditingSessionActiveRef.current = false;
    setIsFocused(false);
    setIsOpen(false);
    setCurrentWord("");
    setEditText("");
    setValidationError(null);
    setIsExpressionDirty(false);
  }, [
    editorRef,
    metricNamesRef,
    handleRemoveMetric,
    onFormulaEntitiesChange,
    selectedMetrics,
  ]);

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
      metricNamesRef.current,
    );
    if (invalidRanges.length > 0) {
      setValidationError(invalidRanges[0].message);
      return;
    }

    setValidationError(null);
  }, [metricNamesRef]);

  const handleChange = useCallback(
    (newText: string) => {
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
        metricNamesRef.current,
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
    },
    [editorRef, metricNamesRef],
  );

  const handleSelect = useCallback(
    (metric: SelectedMetric) => {
      const view = editorRef.current?.view;
      if (!view) {
        return;
      }
      const docText = view.state.doc.toString();
      const cursorPos = view.state.selection.main.head;
      const { start, end } = getWordAtCursor(
        docText,
        cursorPos,
        metricNamesRef.current,
      );

      const metricName = metric.name ?? "";

      // Check if we need to auto-insert a separator before this metric.
      const textBeforeWord = docText.slice(0, start).trimEnd();
      const lastChar = textBeforeWord[textBeforeWord.length - 1];
      const NO_COMMA_CHARS = new Set(["+", "-", "*", "/", "(", ","]);
      const needsComma =
        textBeforeWord.length > 0 && !NO_COMMA_CHARS.has(lastChar);

      // Dispatch through the view (not setEditText) — the value-prop sync
      // in @uiw/react-codemirror does a full doc replacement that destroys
      // all RangeSet-tracked identities.
      let insertText: string;
      let replaceFrom: number;
      let newCursorPos: number;
      if (needsComma) {
        insertText = ", " + metricName;
        replaceFrom = textBeforeWord.length;
        newCursorPos = replaceFrom + insertText.length;
      } else {
        insertText = metricName;
        replaceFrom = start;
        newCursorPos = start + metricName.length;
      }

      view.dispatch({
        changes: { from: replaceFrom, to: end, insert: insertText },
        selection: EditorSelection.cursor(newCursorPos),
      });

      setIsExpressionDirty(true);
      handleAddMetric(metric);

      setCurrentWord("");
      setIsOpen(false);
      dropdownHasSelectionRef.current = false;

      // Return focus to the editor after dropdown closes
      setTimeout(() => {
        editorRef.current?.view?.focus();
      }, 0);
    },
    [editorRef, metricNamesRef, handleAddMetric],
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
            handleRemoveMetric(metric.id, metric.sourceType);
          }
        }
      }

      // Build slot mapping for the removal: surviving old slots map to their
      // new (shifted) indices.  Slots from the removed entity are absent.
      const oldSlots = computeMetricSlots(formulaEntities);
      const slotMapping = new Map<number, number>();
      let newIdx = 0;
      for (const slot of oldSlots) {
        if (slot.entityIndex === itemIndex) {
          continue; // removed
        }
        slotMapping.set(slot.slotIndex, newIdx++);
      }

      onFormulaEntitiesChange(newFormulaEntities, slotMapping);
    },
    [
      formulaEntities,
      selectedMetrics,
      handleRemoveMetric,
      onFormulaEntitiesChange,
    ],
  );

  const handleContainerClick = useCallback(
    (e: React.MouseEvent) => {
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
    },
    [containerRef, editorRef],
  );

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
      metricNamesRef.current,
    );
    // Update the anchor position so the dropdown is correctly placed
    const coords = view.coordsAtPos(wordStart);
    if (coords) {
      setAnchorRect({ left: coords.left, top: coords.bottom });
    }
    setCurrentWord(word);
    setIsOpen(true);
  }, [editorRef, metricNamesRef]);

  const handleEditorKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setIsOpen(false);
    }
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
      metricNamesRef.current,
    );
    if (invalidRanges.length > 0) {
      setValidationError(invalidRanges[0].message);
      return;
    }

    setValidationError(null);
    commitAndCollapse();
  }, [commitAndCollapse, metricNamesRef]);
  handleRunRef.current = handleRun;

  // Sync validation error into the CodeMirror decoration field
  useEffect(() => {
    const view = editorRef.current?.view;
    if (!view) {
      return;
    }
    const ranges =
      validationError !== null
        ? findInvalidRanges(editTextRef.current, metricNamesRef.current)
        : [];
    view.dispatch({ effects: setErrorDecoration.of(ranges) });
  }, [validationError, editorRef, metricNamesRef]);

  // Sync metric entries into the CodeMirror state for atomic token ranges
  useEffect(() => {
    const view = editorRef.current?.view;
    if (!view || !isFocused) {
      return;
    }
    view.dispatch({ effects: setMetricNames.of(metricNames) });
  }, [metricNames, isFocused, editorRef]);

  return {
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
    handleChange,
    handleSelect,
    handleRemoveItem,
    handleContainerClick,
    handleEditorClick,
    handleEditorKeyDown,
    handleDropdownHasSelectionChange,
    handleRun,
    handleRunRef,
    isOpenRef,
    dropdownHasSelectionRef,
  };
}
