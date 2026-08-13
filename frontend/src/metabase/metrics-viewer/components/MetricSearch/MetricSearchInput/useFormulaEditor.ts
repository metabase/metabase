import { EditorSelection, Transaction } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
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
import type { MetricSearchDropdownRef } from "../MetricSearchDropdown";
import {
  type MetricIdentityEntry,
  type MetricNameMap,
  applyTrackedDefinitions,
  buildFullTextWithIdentities,
  cleanupParens,
  findInvalidRanges,
  getWordAtCursor,
  parseFullText,
  planMetricInsertion,
  removeUnmatchedParens,
} from "../utils";

import { setErrorDecoration } from "./errorHighlight";
import {
  addMetricIdentity,
  identitiesFromEntries,
  readMetricIdentities,
  setMetricIdentities,
} from "./metricTokenHighlight";
import { programmaticFormulaUpdate } from "./trustedDocChangesOnly";

type UseFormulaEditorParams = {
  formulaEntities: MetricsViewerFormulaEntity[];
  onFormulaEntitiesChange: (
    entities: MetricsViewerFormulaEntity[],
    slotMapping?: Map<number, number>,
  ) => void;
  selectedMetrics: SelectedMetric[];
  definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry>;
  metricNamesRef: MutableRefObject<MetricNameMap>;
  handleAddMetric: (metric: SelectedMetric) => void;
  handleRemoveMetric: (
    metricId: number,
    sourceType: "metric" | "measure",
  ) => void;
  editorRef: React.RefObject<ReactCodeMirrorRef | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  dropdownRef: React.RefObject<MetricSearchDropdownRef | null>;
};

export type UseFormulaEditorResult = {
  isFocused: boolean;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  currentWord: string;
  validationError: string | null;
  anchorRect: { left: number; top: number };
  isExpressionDirty: boolean;
  pendingFocusRef: MutableRefObject<boolean>;
  handleInputFocus: () => void;
  handleEditorCreate: (view: EditorView) => void;
  handleInputBlur: (event: React.FocusEvent) => void;
  handleEditExpression: (entityIndex: number) => void;
  handleChange: (newText: string) => void;
  handleSelect: (metric: SelectedMetric) => void;
  handleRemoveItem: (itemIndex: number) => void;
  handleContainerClick: (e: React.MouseEvent) => void;
  handleEditorClick: () => void;
  handleEditorKeyDown: (e: React.KeyboardEvent) => void;
  handleRun: () => void;
  // Refs needed by editorExtensions builder
  handleRunRef: MutableRefObject<() => void>;
};

export function useFormulaEditor({
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
}: UseFormulaEditorParams): UseFormulaEditorResult {
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

  const pendingFocusRef = useRef(false);
  const isCollapsingRef = useRef(false);
  // When set, overrides the default end-of-doc caret position on focus —
  // used when the user triggers "Edit" from a specific expression pill so the
  // caret lands at the end of that expression instead of the full formula.
  const pendingCaretPositionRef = useRef<number | null>(null);
  // Refs for reading latest values in callbacks without stale closures
  const editTextRef = useRef("");
  const formulaEntitiesRef = useRef(formulaEntities);
  formulaEntitiesRef.current = formulaEntities;
  const definitionsRef = useRef(definitions);
  definitionsRef.current = definitions;
  // Tracks whether an editing session is active. Set to true only once
  // handleInputFocus initializes the session; set back to false in commitAndCollapse.
  // Used to prevent autoFocus / view.focus() re-entrancy from reinitializing text.
  const isEditingSessionActiveRef = useRef(false);

  const handleRunRef = useRef<() => void>(() => {});
  // Text captured at focus time — used to detect whether the user actually
  // changed the expression and therefore needs to click "Run" to commit.
  const textAtFocusRef = useRef("");
  const isSyncingDocRef = useRef(false);
  // Explicitly tracks whether the expression was modified during this editing
  // session (metric selected from dropdown, or text typed).
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

  // Deferred via requestMeasure because coordsAtPos needs the freshly created
  // editor to be laid out and measured first. A destroyed view (e.g. a
  // StrictMode remount) cancels its pending measure, so no staleness guards
  // are needed beyond the session-active check.
  const scheduleDropdownAtCaret = useCallback(
    (view: EditorView, caretPos: number, shouldOpenDropdown: boolean) => {
      view.requestMeasure({
        read: (measuredView) =>
          measuredView.coordsAtPos(
            Math.min(caretPos, measuredView.state.doc.length),
          ),
        write: (coords) => {
          if (!isEditingSessionActiveRef.current) {
            return;
          }
          if (coords) {
            setAnchorRect({ left: coords.left, top: coords.bottom });
          }
          if (shouldOpenDropdown) {
            setCurrentWord("");
            setIsOpen(true);
          }
        },
      });
    },
    [],
  );

  /** One transaction that fixes the doc (only if it diverges), sets the caret, and installs identities atomically. */
  const syncViewWithSession = useCallback(
    (
      view: EditorView,
      fullText: string,
      identities: MetricIdentityEntry[],
      caretPos: number,
    ) => {
      const currentDoc = view.state.doc.toString();
      // Replacing the doc with identical text still wipes identities
      // (TrackDel maps positions through the deletion), so only dispatch
      // changes when the text actually diverges.
      const changes =
        currentDoc !== fullText
          ? { from: 0, to: currentDoc.length, insert: fullText }
          : undefined;
      isSyncingDocRef.current = true;
      view.dispatch({
        changes,
        selection: EditorSelection.cursor(caretPos),
        effects: setMetricIdentities.of(identitiesFromEntries(identities)),
        annotations: [
          Transaction.addToHistory.of(false),
          programmaticFormulaUpdate.of(true),
        ],
      });
      isSyncingDocRef.current = false;
    },
    [],
  );

  /** Session text, identities and caret derived from the committed entities and the requested caret. */
  const planEditingSession = useCallback(() => {
    const { text: fullText, identities } = buildFullTextWithIdentities(
      formulaEntitiesRef.current,
      metricNamesRef.current,
    );
    const requestedCaret = pendingCaretPositionRef.current;
    return {
      fullText,
      identities,
      caretPos: Math.min(requestedCaret ?? Infinity, fullText.length),
      shouldOpenDropdown: requestedCaret === null,
    };
  }, [metricNamesRef]);

  /** Resets the React side of a session: the committed baseline and the editing flags. */
  const applySessionState = useCallback((fullText: string) => {
    textAtFocusRef.current = fullText;
    editTextRef.current = fullText;
    setIsFocused(true);
    setValidationError(null);
    setIsExpressionDirty(false);
  }, []);

  const initializeEditingSession = useCallback(
    (viewOverride?: EditorView) => {
      if (isCollapsingRef.current) {
        return;
      }
      // If an editing session is already active (e.g. focus returning from a
      // dropdown item click via view.focus()), do not reset the text or the
      // committed baseline.
      if (isEditingSessionActiveRef.current) {
        return;
      }
      isEditingSessionActiveRef.current = true;

      const { fullText, identities, caretPos, shouldOpenDropdown } =
        planEditingSession();
      applySessionState(fullText);

      const view = viewOverride ?? editorRef.current?.view;
      if (!view) {
        return;
      }

      syncViewWithSession(view, fullText, identities, caretPos);
      scheduleDropdownAtCaret(view, caretPos, shouldOpenDropdown);
    },
    [
      editorRef,
      planEditingSession,
      applySessionState,
      syncViewWithSession,
      scheduleDropdownAtCaret,
    ],
  );

  const handleInputFocus = useCallback(() => {
    initializeEditingSession();
  }, [initializeEditingSession]);

  const handleEditorCreate = useCallback(
    (view: EditorView) => {
      isEditingSessionActiveRef.current = false;
      initializeEditingSession(view);
    },
    [initializeEditingSession],
  );

  /**
   * Transition into focused-formula mode and place the caret at the end of
   * the expression at `entityIndex` within the full formula text.
   */
  const handleEditExpression = useCallback(
    (entityIndex: number) => {
      const entities = formulaEntitiesRef.current;
      if (entityIndex < 0 || entityIndex >= entities.length) {
        return;
      }
      const { text } = buildFullTextWithIdentities(
        entities.slice(0, entityIndex + 1),
        metricNamesRef.current,
      );
      isCollapsingRef.current = false;
      pendingCaretPositionRef.current = text.length;
      pendingFocusRef.current = true;
      setIsFocused(true);
    },
    [metricNamesRef],
  );

  /** Commits the current text: parses formula entities, removes unreferenced metrics, and collapses. */
  const commitAndCollapse = useCallback(() => {
    const view = editorRef.current?.view;
    const newText = view ? view.state.doc.toString() : editTextRef.current;
    const trackedIdentities = view ? readMetricIdentities(view) : [];

    const parsedEntities = parseFullText(
      newText,
      metricNamesRef.current,
      trackedIdentities,
    );
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
    isCollapsingRef.current = true;
    isEditingSessionActiveRef.current = false;
    pendingCaretPositionRef.current = null;
    textAtFocusRef.current = newText;
    setIsFocused(false);
    setIsOpen(false);
    setCurrentWord("");
    editTextRef.current = "";
    setValidationError(null);
    setIsExpressionDirty(false);
    if (view && view.state.doc.length > 0) {
      isSyncingDocRef.current = true;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length },
        annotations: [
          Transaction.addToHistory.of(false),
          programmaticFormulaUpdate.of(true),
        ],
      });
      isSyncingDocRef.current = false;
    }
  }, [
    editorRef,
    metricNamesRef,
    handleRemoveMetric,
    onFormulaEntitiesChange,
    selectedMetrics,
  ]);

  const handleInputBlur = useCallback(
    (event: React.FocusEvent) => {
      const view = editorRef.current?.view;
      const docText = view ? view.state.doc.toString() : editTextRef.current;
      // If the text hasn't changed since focus, collapse back to pills view
      // without requiring the user to click "Run".
      if (
        docText === textAtFocusRef.current &&
        !dropdownRef.current?.containerRef.current?.contains(
          event.relatedTarget,
        )
      ) {
        isEditingSessionActiveRef.current = false;
        pendingCaretPositionRef.current = null;
        setIsFocused(false);
        setIsOpen(false);
        setCurrentWord("");
        setValidationError(null);
        setIsExpressionDirty(false);
        return;
      }

      const identities = view ? readMetricIdentities(view) : [];
      const invalidRanges = findInvalidRanges(
        docText,
        metricNamesRef.current,
        identities,
      );
      if (invalidRanges.length > 0) {
        setValidationError(invalidRanges[0].message);
        return;
      }

      setValidationError(null);
    },
    [editorRef, metricNamesRef, dropdownRef],
  );

  const handleChange = useCallback(
    (newText: string) => {
      if (isSyncingDocRef.current) {
        return;
      }
      const view = editorRef.current?.view;
      editTextRef.current = newText;
      setValidationError(null);
      if (isCollapsingRef.current) {
        return;
      }
      if (newText !== textAtFocusRef.current) {
        setIsExpressionDirty(true);
      }

      // Extract the word at the cursor for the dropdown search
      const cursorPos = view?.state.selection.main.head ?? newText.length;
      const identities = view ? readMetricIdentities(view) : [];
      const { word, start: wordStart } = getWordAtCursor(
        newText,
        cursorPos,
        metricNamesRef.current,
        identities,
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
      const identities = readMetricIdentities(view);
      const { start, end } = getWordAtCursor(
        docText,
        cursorPos,
        metricNamesRef.current,
        identities,
      );

      const metricName = metric.name ?? "";
      if (metricName.length === 0) {
        return;
      }

      const {
        insertText,
        replaceFrom,
        replaceTo,
        newCursorPos,
        metricFrom,
        metricTo,
        isAtEndOfFormula,
      } = planMetricInsertion({
        docText,
        wordStart: start,
        wordEnd: end,
        metricName,
      });

      const sourceId =
        metric.sourceType === "metric"
          ? createMetricSourceId(metric.id)
          : createMeasureSourceId(metric.id);

      view.dispatch({
        changes: { from: replaceFrom, to: replaceTo, insert: insertText },
        selection: EditorSelection.cursor(newCursorPos),
        effects: addMetricIdentity.of({
          from: metricFrom,
          to: metricTo,
          sourceId,
          definition: definitionsRef.current[sourceId]?.definition ?? null,
        }),
        annotations: programmaticFormulaUpdate.of(true),
      });
      editTextRef.current = view.state.doc.toString();

      setIsExpressionDirty(true);
      handleAddMetric(metric);

      setCurrentWord("");
      setIsOpen(false);

      setTimeout(() => {
        const view = editorRef.current?.view;
        if (!view || !isEditingSessionActiveRef.current) {
          return;
        }
        // Return focus to the editor after the dropdown item click stole it
        view.focus();
        if (isAtEndOfFormula) {
          const coords = view.coordsAtPos(newCursorPos);
          if (coords) {
            setAnchorRect({ left: coords.left, top: coords.bottom });
          }
          setIsOpen(true);
        }
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
      isCollapsingRef.current = false;
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
    const identities = readMetricIdentities(view);
    const { word, start: wordStart } = getWordAtCursor(
      text,
      cursorPos,
      metricNamesRef.current,
      identities,
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

  /** Validate the expression and either show an error or commit + run the query. */
  const handleRun = useCallback(() => {
    const view = editorRef.current?.view;
    const docText = view ? view.state.doc.toString() : editTextRef.current;
    const identities = view ? readMetricIdentities(view) : [];
    const invalidRanges = findInvalidRanges(
      docText,
      metricNamesRef.current,
      identities,
    );
    if (invalidRanges.length > 0) {
      setValidationError(invalidRanges[0].message);
      return;
    }

    setValidationError(null);
    commitAndCollapse();
  }, [commitAndCollapse, editorRef, metricNamesRef]);
  handleRunRef.current = handleRun;

  // Sync validation error into the CodeMirror decoration field
  useEffect(() => {
    const view = editorRef.current?.view;
    if (!view) {
      return;
    }
    const identities = readMetricIdentities(view);
    const ranges =
      validationError !== null
        ? findInvalidRanges(
            view.state.doc.toString(),
            metricNamesRef.current,
            identities,
          )
        : [];
    view.dispatch({ effects: setErrorDecoration.of(ranges) });
  }, [validationError, editorRef, metricNamesRef]);

  return {
    isFocused,
    isOpen,
    setIsOpen,
    currentWord,
    validationError,
    anchorRect,
    isExpressionDirty,
    pendingFocusRef,
    handleInputFocus,
    handleEditorCreate,
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
  };
}
