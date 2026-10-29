import Paragraph from "@tiptap/extension-paragraph";
import { Placeholder } from "@tiptap/extension-placeholder";
import Text from "@tiptap/extension-text";
import { NodeSelection } from "@tiptap/pm/state";
import type { Transaction } from "@tiptap/pm/state";
import { EditorContent, useEditor } from "@tiptap/react";
import {
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLatest, usePrevious } from "react-use";
import { t } from "ttag";

import { useSuggestPrototypeFiltersMutation } from "metabase/api";
import { getFilterItems } from "metabase/querying/filters/components/FilterPanel/utils";
import { FilterAutoApplyContext } from "metabase/querying/filters/components/FilterPicker/FilterAutoApplyContext";
import { Flex, Icon } from "metabase/ui";
import { getCspNonce } from "metabase/utils/csp";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import { areQueriesEqual } from "../../../FilterAutoApply/utils";
import { PopoverFilterPill } from "../KeyboardFilterRow/PopoverFilterPill";
import { requestAiFilters } from "../KeyboardFilterRow/ai-filters";

import BS from "./FilterExpressionBarC.module.css";
import S from "./FilterRowC.module.css";
import {
  AiPopover,
  ClausePopover,
  PickerPopover,
  SegmentPopover,
} from "./FloatingPopovers";
import { ValueStage, type ValueStageModel } from "./ValueStage";
import {
  type ActionContext,
  autoCommit,
  commitDraft,
  findAiPill,
  removeLeadingConnector,
  removeLoneFieldDrafts,
  replaceText,
  replaceWithNode,
  replaceWithPillItems,
  setNodeAttrsSilently,
  startFilterAfterConnector,
  startNewFilter,
  unwrapNode,
} from "./editor-actions";
import {
  AiPill,
  BarHistory,
  type BarRuntime,
  ClausePill,
  FilterPill,
  LogicHighlight,
  type SegmentPart,
  SingleLineDocument,
} from "./extensions";
import { MOCK_AI_DELAY_MS, getMockAiItems } from "./mock-ai";
import {
  AI_PREFIX,
  type Draft,
  type PillAttrs,
  pillText,
  splitRangeText,
  tokensOf,
  validate,
} from "./parser";
import {
  type Anchor,
  type BarOptionGroup,
  BarPopover,
  OptionList,
  flattenOptions,
  getAnchorBelow,
} from "./popover-ui";
import {
  type AiEntry,
  type BarStore,
  type PillItem,
  addClause,
  createBarStore,
  docFromQuery,
  getFiltersFromTokens,
  getPillItem,
  getQueryWithFilters,
  newId,
} from "./query-sync";
import { type SchemaField, getFilterSchema } from "./schema";
import { type Suggestions, getSuggestions } from "./suggestions";

/** Marks a transaction that loads the bar from the query, so it's not applied back. */
const SYNC_META = "filterBarSync";
const VIEWPORT_MARGIN = 16;

type Floating =
  | { kind: "segment"; pos: number; part: "field" | "operator"; anchor: Anchor }
  | { kind: "clause"; pos: number; anchor: Anchor }
  | { kind: "ai"; pos: number; anchor: Anchor }
  | { kind: "picker"; draft: Draft; field: SchemaField; anchor: Anchor };

interface FilterExpressionBarCProps {
  question: Question;
  expanded: boolean;
  draftKey: number | null;
  onAddDraft: () => void;
  onRemoveDraft: () => void;
  updateQuestion: (
    question: Question,
    opts?: { run?: boolean; shouldUpdateUrl?: boolean },
  ) => void;
}

/**
 * Prototype: Version C of the filter bar, which started as a copy of Version B. One line of free text where complete filters
 * turn into pills, and "and", "or" and parentheses combine them. A popover
 * under the caret suggests the field, the operator and the values, and text
 * that matches no field can go to the AI. Changes apply while the whole
 * expression is valid.
 */
export function FilterExpressionBarC({
  question,
  expanded,
  draftKey,
  onRemoveDraft,
  updateQuestion,
}: FilterExpressionBarCProps) {
  const query = question.query();
  const stageIndex = Lib.stageCount(query) - 1;
  const schema = useMemo(
    () => getFilterSchema(query, stageIndex),
    [query, stageIndex],
  );
  const [store] = useState<BarStore>(createBarStore);
  const context: ActionContext & { store: BarStore } = {
    schema,
    knownValues: store.knownValues,
    store,
  };
  const contextRef = useLatest(context);
  const autoApply = useContext(FilterAutoApplyContext);
  const latestQuestion = useLatest(question);
  const lastLoadedQueryRef = useRef<Lib.Query | null>(null);
  const [suggestFilters] = useSuggestPrototypeFiltersMutation();

  // The highlight and the dismissed popover live in refs, so the key handler
  // sees the latest values even when keys come faster than renders.
  const [, setTick] = useState(0);
  const rerender = () => setTick((tick) => tick + 1);
  const highlightRef = useRef({ key: "", index: 0 });
  const dismissedRef = useRef<string | null>(null);
  const valueModelRef = useRef<ValueStageModel | null>(null);
  const setHighlight = (key: string, index: number) => {
    highlightRef.current = { key, index };
    rerender();
  };
  const setDismissed = (key: string | null) => {
    dismissedRef.current = key;
    rerender();
  };

  const [floating, setFloating] = useState<Floating | null>(null);
  const floatingRef = useRef<HTMLDivElement>(null);
  const keyHandlerRef = useRef<(event: KeyboardEvent) => boolean>(() => false);
  const handlersRef = useRef({
    onDocChange: (_tr: Transaction) => {},
    onSelectionChange: () => {},
    onBlur: () => {},
  });

  const [runtimeRef] = useState<{ current: BarRuntime }>(() => ({
    current: {
      schema,
      store,
      openSegment: () => {},
      openClause: () => {},
      openAi: () => {},
      onAddFilter: () => {},
    },
  }));

  const editor = useEditor(
    {
      immediatelyRender: true,
      shouldRerenderOnTransaction: true,
      injectNonce: getCspNonce(),
      extensions: [
        SingleLineDocument,
        Paragraph,
        Text,
        BarHistory,
        Placeholder.configure({
          placeholder: t`Type a filter, like “Category is Gizmo”, or / to ask AI`,
        }),
        FilterPill.configure({ runtime: runtimeRef }),
        ClausePill.configure({ runtime: runtimeRef }),
        AiPill.configure({ runtime: runtimeRef }),
        LogicHighlight.configure({ runtime: runtimeRef }),
      ],
      editorProps: {
        attributes: {
          class: BS.editor,
          spellcheck: "false",
          "data-testid": "filter-expression-editor",
        },
        handleKeyDown: (_view, event) => keyHandlerRef.current(event),
        transformPastedText: (text) => text.replace(/\s*\n\s*/g, " "),
      },
      onUpdate: ({ transaction }) =>
        handlersRef.current.onDocChange(transaction),
      onSelectionUpdate: () => handlersRef.current.onSelectionChange(),
      onFocus: () => rerender(),
      onBlur: () => handlersRef.current.onBlur(),
    },
    [],
  );
  const view = editor?.view;

  // ---------- Applying the bar to the query ----------

  const setQuery = (newQuery: Lib.Query) => {
    const question = latestQuestion.current;
    if (areQueriesEqual(newQuery, question.query())) {
      return;
    }
    lastLoadedQueryRef.current = newQuery;
    // Prototype: on slow data, a filter change only makes the result out of
    // date, and the user reruns the question with the run button.
    const isSlowData = !(autoApply?.isEnabled(newQuery) ?? true);
    updateQuestion(question.setQuery(newQuery), {
      run: !isSlowData,
      shouldUpdateUrl: isSlowData,
    });
  };

  const applyBar = () => {
    if (editor == null || editor.isDestroyed) {
      return;
    }
    const { schema, knownValues, store } = contextRef.current;
    const tokens = tokensOf(editor.state.doc, schema, knownValues);
    if (validate(tokens).length > 0) {
      return;
    }
    const filters = getFiltersFromTokens(tokens, schema, store);
    if (filters == null) {
      return;
    }
    setQuery(
      getQueryWithFilters(
        latestQuestion.current.query(),
        schema.stageIndex,
        filters,
      ),
    );
  };

  handlersRef.current = {
    onDocChange: (tr) => {
      if (!tr.docChanged || tr.getMeta(SYNC_META)) {
        return;
      }
      setDismissed(null);
      const isInsertion = tr.doc.content.size > tr.before.content.size;
      queueMicrotask(() => {
        if (editor != null && !editor.isDestroyed) {
          autoCommit(editor.view, false, contextRef.current);
          if (isInsertion) {
            startFilterAfterConnector(editor.view, contextRef.current);
          } else {
            removeLeadingConnector(editor.view);
          }
          applyBar();
        }
      });
    },
    onSelectionChange: () =>
      queueMicrotask(() => {
        if (editor != null && !editor.isDestroyed) {
          autoCommit(editor.view, false, contextRef.current);
        }
      }),
    onBlur: () => {
      rerender();
      // The date picker takes the focus while its field waits in the bar.
      const isPickerOpen = floating?.kind === "picker";
      queueMicrotask(() => {
        if (editor != null && !editor.isDestroyed) {
          if (!isPickerOpen) {
            removeLoneFieldDrafts(editor.view, contextRef.current);
          }
          autoCommit(editor.view, true, contextRef.current);
          applyBar();
        }
      });
    },
  };

  // Loads the filters into the bar, unless the query is the one the bar applied.
  useLayoutEffect(() => {
    if (editor == null) {
      return;
    }
    const lastQuery = lastLoadedQueryRef.current;
    if (lastQuery != null && areQueriesEqual(query, lastQuery)) {
      return;
    }
    lastLoadedQueryRef.current = query;
    runtimeRef.current.schema = schema;
    const content = docFromQuery(query, stageIndex, schema, store);
    editor
      .chain()
      .setMeta(SYNC_META, true)
      .setMeta("addToHistory", false)
      .setContent(content, { emitUpdate: false })
      .run();
  }, [editor, query, stageIndex, schema, store, runtimeRef]);

  // ---------- Pills, AI and popovers ----------

  const openFloatingAt = (floating: Floating) => {
    setDismissed(null);
    setFloating(floating);
  };

  runtimeRef.current = {
    schema,
    store,
    onAddFilter: () => addFilterRef.current(),
    openSegment: (pos: number, part: SegmentPart, anchorElement) => {
      if (view == null) {
        return;
      }
      const node = view.state.doc.nodeAt(pos);
      if (part === "value" && node != null) {
        // The values are edited in the bar, with the value popover.
        const attrs: PillAttrs = {
          columnKey: node.attrs.columnKey,
          operatorKey: node.attrs.operatorKey,
          values: node.attrs.values,
        };
        setFloating(null);
        unwrapNode(view, pos, pillText(attrs, schema, store.knownValues));
        return;
      }
      if (part !== "value") {
        openFloatingAt({
          kind: "segment",
          pos,
          part,
          anchor: getAnchorBelow(anchorElement.getBoundingClientRect()),
        });
      }
    },
    openClause: (pos, anchorElement) =>
      openFloatingAt({
        kind: "clause",
        pos,
        anchor: getAnchorBelow(anchorElement.getBoundingClientRect()),
      }),
    openAi: (pos, anchorElement) =>
      openFloatingAt({
        kind: "ai",
        pos,
        anchor: getAnchorBelow(anchorElement.getBoundingClientRect()),
      }),
  };

  const startAi = (draft: Draft, prompt: string) => {
    if (view == null || prompt.length === 0) {
      return;
    }
    const aiId = newId("ai");
    const entry: AiEntry = {
      prompt,
      status: "loading",
      filters: [],
      items: [],
    };
    store.ai.set(aiId, entry);
    replaceWithNode(
      view,
      draft.from,
      draft.to,
      view.state.schema.nodes.aiPill.create({
        aiId,
        prompt,
        status: "loading",
      }),
    );
    const { query: aiQuery, stageIndex: aiStageIndex } = schema;

    const finish = (items: PillItem[] | undefined, error?: string) => {
      if (editor == null || editor.isDestroyed) {
        return;
      }
      const found = findAiPill(editor.view, aiId);
      if (items != null && items.length > 0) {
        store.ai.set(aiId, { ...entry, status: "done", items });
        if (found != null) {
          // Version B: the answer turns into filter pills at once.
          replaceWithPillItems(editor.view, found.pos, items);
        }
      } else {
        store.ai.set(aiId, { ...entry, status: "error", error });
        if (found != null) {
          setNodeAttrsSilently(editor.view, found.pos, { status: "error" });
        }
      }
    };

    const mockItems = getMockAiItems(prompt, schema);
    if (mockItems != null) {
      setTimeout(() => finish(mockItems), MOCK_AI_DELAY_MS);
      return;
    }
    requestAiFilters(suggestFilters, aiQuery, aiStageIndex, prompt).then(
      (result) => {
        const { schema, store } = contextRef.current;
        if (result.status === "ok") {
          finish(
            result.filters.map((filter) =>
              getPillItem(aiQuery, aiStageIndex, filter, schema, store),
            ),
          );
        } else {
          finish(undefined, result.message);
        }
      },
    );
  };

  const insertSegment = (draft: Draft, segment: Lib.SegmentMetadata) => {
    if (view == null) {
      return;
    }
    const clauseId = addClause(store, query, stageIndex, segment);
    replaceWithNode(
      view,
      draft.from,
      draft.to,
      view.state.schema.nodes.clausePill.create({ clauseId }),
    );
  };

  const getActiveSuggestions = (): Suggestions | null => {
    if (view == null) {
      return null;
    }
    const suggestions = getSuggestions({
      view,
      ...contextRef.current,
      startAi,
      insertSegment,
    });
    if (suggestions?.stage !== "value") {
      return suggestions;
    }
    const valueModel = valueModelRef.current;
    const isCurrent = valueModel?.key === suggestions.key;
    return {
      ...suggestions,
      groups: isCurrent ? valueModel.groups : [],
      defaultIndex: isCurrent ? valueModel.defaultIndex : 0,
    };
  };

  const getPopoverState = (suggestions: Suggestions | null) => ({
    isShown:
      suggestions != null &&
      floating == null &&
      (suggestions.groups.length > 0 || suggestions.stage === "value") &&
      dismissedRef.current !== suggestions.key,
    index:
      suggestions != null && highlightRef.current.key === suggestions.key
        ? highlightRef.current.index
        : (suggestions?.defaultIndex ?? 0),
  });

  // ---------- Keys ----------

  keyHandlerRef.current = (event) => {
    if (view == null) {
      return false;
    }
    const { state } = view;
    const selection = state.selection;
    // Recomputed from the editor's current state, not from the last render.
    const suggestions = getActiveSuggestions();
    const { isShown, index } = getPopoverState(suggestions);

    // Version B: a space after the first value of a range, like "between
    // 100", adds the "and" for the second value.
    if (event.key === " " && suggestions?.stage === "value") {
      const { parsed, draft } = suggestions;
      const isAfterFirstRangeValue =
        parsed.op?.isRange === true &&
        parsed.values.length === 1 &&
        splitRangeText(parsed.valueText).second == null &&
        selection.empty &&
        selection.from === draft.to;
      if (isAfterFirstRangeValue) {
        replaceText(view, draft.to, draft.to, ` ${t`and`} `);
        return true;
      }
    }

    if (isShown && suggestions != null) {
      const options = flattenOptions(suggestions.groups);
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const delta = event.key === "ArrowDown" ? 1 : -1;
        const nextIndex = Math.max(
          0,
          Math.min(index + delta, options.length - 1),
        );
        // A preview changes the text, and the highlight follows it.
        if (!suggestions.previewOption?.(nextIndex)) {
          setHighlight(suggestions.key, nextIndex);
        }
        return true;
      }
      if ((event.key === "Enter" || event.key === "Tab") && index >= 0) {
        const option = options[index];
        if (option != null) {
          option.run();
          return true;
        }
      }
      if (event.key === "Escape") {
        setDismissed(suggestions.key);
        return true;
      }
    } else if (event.key === "ArrowDown" && suggestions != null) {
      setDismissed(null);
      return true;
    }

    if (event.key === "Enter") {
      if (selection instanceof NodeSelection) {
        const { node, from } = selection;
        const element = view.nodeDOM(from);
        const anchor =
          element instanceof HTMLElement
            ? getAnchorBelow(element.getBoundingClientRect())
            : { left: 0, top: 0 };
        if (node.type.name === "filterPill") {
          const attrs: PillAttrs = {
            columnKey: node.attrs.columnKey,
            operatorKey: node.attrs.operatorKey,
            values: node.attrs.values,
          };
          unwrapNode(view, from, pillText(attrs, schema, store.knownValues));
        } else if (node.type.name === "clausePill") {
          openFloatingAt({ kind: "clause", pos: from, anchor });
        } else if (node.type.name === "aiPill") {
          openFloatingAt({ kind: "ai", pos: from, anchor });
        }
      } else if (suggestions != null) {
        const { draft } = suggestions;
        if (suggestions.stage === "ai") {
          startAi(draft, draft.text.slice(AI_PREFIX.length).trim());
        } else {
          commitDraft(view, draft, contextRef.current);
        }
      }
      // Never a new line.
      return true;
    }

    // Backspace or Delete next to a pill selects it first, and the second
    // press deletes it.
    if (
      (event.key === "Backspace" || event.key === "Delete") &&
      selection.empty
    ) {
      const $pos = selection.$from;
      const node = event.key === "Backspace" ? $pos.nodeBefore : $pos.nodeAfter;
      if (node != null && !node.isText) {
        const at =
          event.key === "Backspace"
            ? selection.from - node.nodeSize
            : selection.from;
        view.dispatch(
          state.tr.setSelection(NodeSelection.create(state.doc, at)),
        );
        return true;
      }
    }
    return false;
  };

  // ---------- Focus ----------

  const focusEnd = () => {
    if (editor == null) {
      return;
    }
    const end = editor.state.doc.content.size - 1;
    const last = editor.state.doc.textBetween(Math.max(1, end - 1), end);
    editor.commands.focus("end");
    if (end > 1 && last !== " " && last !== "(") {
      replaceText(editor.view, end, end, " ");
    }
    setFloating(null);
    setDismissed(null);
  };

  /**
   * Version B: a new filter at the end, with the first field filled in.
   */
  const addFilter = () => {
    if (editor == null) {
      return;
    }
    const { view } = editor;
    const { schema, knownValues } = contextRef.current;
    const tokens = tokensOf(view.state.doc, schema, knownValues);
    const lastToken = tokens[tokens.length - 1];
    editor.commands.focus("end");
    setFloating(null);
    setDismissed(null);
    if (lastToken?.kind === "text") {
      return;
    }
    // Pills next to each other are joined with an implicit AND.
    startNewFilter(view, view.state.doc.content.size - 1, schema);
  };
  const addFilterRef = useLatest(addFilter);

  useEffect(() => {
    if (draftKey != null) {
      addFilterRef.current();
      onRemoveDraft();
    }
  }, [draftKey, addFilterRef, onRemoveDraft]);

  // Version B: opening an empty bar, like with the Filter button, starts a
  // filter at once. F also bumps `draftKey`, but a second call does nothing
  // because the bar already has the new filter's text.
  const wasExpanded = usePrevious(expanded);
  useEffect(() => {
    const isEmpty = editor == null || editor.state.doc.textContent === "";
    const hasNoPills = editor?.state.doc.firstChild?.childCount === 0;
    if (expanded && wasExpanded === false && isEmpty && hasNoPills) {
      addFilterRef.current();
    }
  }, [expanded, wasExpanded, editor, addFilterRef]);

  // A click outside a floating popover closes it. Clicks on pill segments
  // open one instead, and clicks in Mantine portals belong to the pickers.
  useEffect(() => {
    if (floating == null) {
      return;
    }
    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (
        !(target instanceof Element) ||
        target.closest("[data-seg]") != null ||
        target.closest("[data-portal]") != null ||
        floatingRef.current?.contains(target)
      ) {
        return;
      }
      setFloating(null);
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [floating]);

  // ---------- Render ----------

  const isFocused = editor?.isFocused ?? false;
  const suggestions = isFocused ? getActiveSuggestions() : null;
  const { isShown, index } = getPopoverState(suggestions);
  const tokens =
    editor != null ? tokensOf(editor.state.doc, schema, store.knownValues) : [];
  const errors = validate(tokens);

  // A column like a date has no inline operators, so it opens its picker.
  const pickerKey =
    suggestions?.stage === "picker" ? suggestions.key : undefined;
  useEffect(() => {
    if (pickerKey == null || view == null || suggestions == null) {
      return;
    }
    const field = suggestions.parsed.field;
    if (field == null) {
      return;
    }
    const coords = view.coordsAtPos(suggestions.draft.from);
    setFloating({
      kind: "picker",
      draft: suggestions.draft,
      field,
      anchor: getAnchorBelow(coords),
    });
    // Only a new picker stage opens the picker.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickerKey]);

  if (!expanded) {
    return null;
  }

  const earlierItems = getFilterItems(query).filter(
    (item) => item.stageIndex < stageIndex,
  );
  const caretAnchor =
    isShown && view != null && suggestions != null
      ? getAnchorBelow(view.coordsAtPos(suggestions.draft.from))
      : null;
  const maxWidth =
    caretAnchor != null
      ? window.innerWidth - caretAnchor.left - VIEWPORT_MARGIN
      : Infinity;

  const renderCaretPopover = () => {
    if (caretAnchor == null || suggestions == null || view == null) {
      return null;
    }
    const { parsed, stage } = suggestions;
    if (stage === "value" && parsed.field != null && parsed.op != null) {
      return (
        <ValueStage
          view={view}
          context={context}
          suggestionKey={suggestions.key}
          draft={suggestions.draft}
          parsed={parsed}
          field={parsed.field}
          op={parsed.op}
          anchor={caretAnchor}
          highlight={highlightRef.current}
          maxWidth={maxWidth}
          onHighlight={(index) => setHighlight(suggestions.key, index)}
          onPublish={(model) => {
            valueModelRef.current = model;
          }}
        />
      );
    }
    return (
      <CaretOptions
        anchor={caretAnchor}
        groups={suggestions.groups}
        showsLogicHint={suggestions.showsLogicHint}
        highlightIndex={index}
        onHighlight={(index) => setHighlight(suggestions.key, index)}
      />
    );
  };

  const renderFloating = () => {
    if (floating == null || view == null) {
      return null;
    }
    const common = {
      view,
      context,
      anchor: floating.anchor,
      popoverRef: floatingRef,
      onClose: () => setFloating(null),
    };
    switch (floating.kind) {
      case "segment":
        return (
          <SegmentPopover {...common} pos={floating.pos} part={floating.part} />
        );
      case "clause":
        return <ClausePopover {...common} pos={floating.pos} />;
      case "ai":
        return <AiPopover {...common} pos={floating.pos} />;
      case "picker":
        return (
          <PickerPopover
            {...common}
            draft={floating.draft}
            field={floating.field}
          />
        );
    }
  };

  return (
    <Flex
      className={S.row}
      direction="column"
      gap={4}
      py="sm"
      data-testid="filter-expression-bar"
    >
      <Flex
        align="center"
        gap="sm"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            event.preventDefault();
            focusEnd();
          }
        }}
      >
        {earlierItems.map(({ filter, filterIndex, stageIndex }, itemIndex) => (
          <PopoverFilterPill
            key={itemIndex}
            query={query}
            stageIndex={stageIndex}
            filter={filter}
            filterIndex={filterIndex}
            onChange={(newQuery) => setQuery(Lib.dropEmptyStages(newQuery))}
          />
        ))}
        <EditorContent editor={editor} className={BS.editorWrapper} />
      </Flex>
      {!isFocused && errors.length > 0 && (
        <div className={BS.statusError} data-testid="filter-bar-errors">
          {t`Not applied:`} {errors.join(" · ")}
        </div>
      )}
      {renderCaretPopover()}
      {renderFloating()}
    </Flex>
  );
}

interface CaretOptionsProps {
  anchor: Anchor;
  groups: BarOptionGroup[];
  showsLogicHint: boolean;
  highlightIndex: number;
  onHighlight: (index: number) => void;
}

function CaretOptions({
  anchor,
  groups,
  showsLogicHint,
  highlightIndex,
  onHighlight,
}: CaretOptionsProps) {
  return (
    <BarPopover anchor={anchor}>
      <OptionList
        groups={groups}
        highlightIndex={highlightIndex}
        maxHeight="24rem"
        onHighlight={onHighlight}
      />
      {showsLogicHint && <LogicHint />}
    </BarPopover>
  );
}

const LOGIC_HINT_OPERATORS = ["AND", "OR", "(", ")"];

/** Version B: the logic operators, which are typed, not picked. */
function LogicHint() {
  return (
    <Flex
      className={BS.logicHint}
      align="center"
      justify="space-between"
      gap="sm"
      data-testid="filter-logic-hint"
    >
      <Flex align="center" gap="xs">
        <Icon name="info" size={14} />
        <span>{t`Logic operators`}</span>
      </Flex>
      <Flex align="center" gap={4}>
        {LOGIC_HINT_OPERATORS.map((operator, index) => (
          <span key={operator}>
            <span className={BS.logicChip}>{operator}</span>
            {index < LOGIC_HINT_OPERATORS.length - 1 && ","}
          </span>
        ))}
      </Flex>
    </Flex>
  );
}

type RenderCheckOpts = {
  question: Question;
  queryBuilderMode: string;
};

FilterExpressionBarC.shouldRender = ({
  question,
  queryBuilderMode,
}: RenderCheckOpts) => {
  const { isEditable, isNative } = Lib.queryDisplayInfo(question.query());
  return (
    queryBuilderMode === "view" &&
    !isNative &&
    isEditable &&
    !question.isArchived()
  );
};
