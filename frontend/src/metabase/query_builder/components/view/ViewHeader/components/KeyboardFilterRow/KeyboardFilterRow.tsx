import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLatest } from "react-use";
import { t } from "ttag";

import {
  INLINE_PILL_CLICK_OUTSIDE,
  INLINE_PILL_EDITING,
  usePrototypeSetting,
} from "metabase/prototype";
import { getFilterItems } from "metabase/querying/filters/components/FilterPanel/utils";
import { FilterAutoApplyContext } from "metabase/querying/filters/components/FilterPicker/FilterPreviewContext";
import type { QueryBuilderMode } from "metabase/redux/store";
import { Flex, Icon, Tooltip } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import {
  areQueriesEqual,
  getPreviewQuery,
} from "../../../FilterLivePreview/FilterLivePreview";

import { type DraftChangeSource, DraftFilterPill } from "./DraftFilterPill";
import { type FilterPillPart, FilterPillParts } from "./FilterPillParts";
import S from "./KeyboardFilterRow.module.css";
import { PopoverFilterPill } from "./PopoverFilterPill";
import type { DraftState } from "./types";
import { getDraftStateFromFilter } from "./utils";

/** The filter that a draft pill edits, and the query from before the edit. */
type ActiveDraft = {
  key: number;
  query: Lib.Query;
  stageIndex: number;
  filter?: Lib.FilterClause;
  initialState?: DraftState;
  initialEditedPart?: "column" | "operator";
  /** The item that the draft pill replaces in the row. */
  itemIndex?: number;
  /** For a new filter, where it appears in the query once it is applied. */
  newFilterPosition?: { stageIndex: number; filterIndex: number };
};

interface KeyboardFilterRowProps {
  question: Question;
  expanded: boolean;
  draftKey: number | null;
  onAddDraft: () => void;
  onRemoveDraft: () => void;
  updateQuestion: (question: Question, opts?: { run?: boolean }) => void;
}

/**
 * Prototype: the filter pills of the question, with a button that adds a new
 * filter as a pill with an input. On data where filters apply as the user
 * changes them, the pill applies its filter at each change.
 */
export function KeyboardFilterRow({
  question,
  expanded,
  draftKey,
  onAddDraft,
  onRemoveDraft,
  updateQuestion,
}: KeyboardFilterRowProps) {
  const query = question.query();
  const items = useMemo(() => getFilterItems(query), [query]);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const [activeDraft, setActiveDraft] = useState<ActiveDraft | null>(null);
  const [editingMode] = usePrototypeSetting(INLINE_PILL_EDITING);
  const [clickOutsideMode] = usePrototypeSetting(INLINE_PILL_CLICK_OUTSIDE);
  const autoApply = useContext(FilterAutoApplyContext);
  const latestQuestion = useLatest(question);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const isAutoApply =
    activeDraft != null && (autoApply?.isEnabled(activeDraft.query) ?? false);

  useEffect(() => {
    if (draftKey == null) {
      return;
    }
    const query = latestQuestion.current.query();
    const stageIndex = Lib.stageCount(query) - 1;
    setActiveDraft({
      key: draftKey,
      query,
      stageIndex,
      newFilterPosition: {
        stageIndex,
        filterIndex: Lib.filters(query, stageIndex).length,
      },
    });
  }, [draftKey, latestQuestion]);

  useEffect(() => () => clearTimeout(typingTimeoutRef.current), []);

  const setQuery = (newQuery: Lib.Query) => {
    const question = latestQuestion.current;
    if (!areQueriesEqual(newQuery, question.query())) {
      updateQuestion(question.setQuery(newQuery), { run: true });
    }
  };

  const applyDraft = (
    draft: ActiveDraft,
    filter: Lib.ExpressionClause | Lib.SegmentMetadata,
  ) => {
    setQuery(
      getPreviewQuery(draft.query, draft.stageIndex, draft.filter, filter),
    );
  };

  const closeDraft = () => {
    clearTimeout(typingTimeoutRef.current);
    setActiveDraft(null);
    onRemoveDraft();
    addButtonRef.current?.focus();
  };

  const handleDraftChange = (
    filter: Lib.ExpressionClause | undefined,
    source: DraftChangeSource,
  ) => {
    clearTimeout(typingTimeoutRef.current);
    if (!isAutoApply || activeDraft == null || filter == null) {
      return;
    }
    if (source === "selection") {
      applyDraft(activeDraft, filter);
    } else if (autoApply?.typedValuesApplyMode === "pause") {
      typingTimeoutRef.current = setTimeout(
        () => applyDraft(activeDraft, filter),
        autoApply.typingPauseMs,
      );
    }
  };

  const handleSubmit = (filter: Lib.ExpressionClause | Lib.SegmentMetadata) => {
    if (activeDraft != null) {
      applyDraft(activeDraft, filter);
    }
    closeDraft();
  };

  const handleSubmitFilters = (filters: Lib.ExpressionClause[]) => {
    if (activeDraft != null) {
      const { query, stageIndex } = activeDraft;
      setQuery(
        Lib.dropEmptyStages(
          filters.reduce(
            (newQuery, filter) => Lib.filter(newQuery, stageIndex, filter),
            query,
          ),
        ),
      );
    }
    closeDraft();
  };

  const handleCancel = () => {
    if (isAutoApply && activeDraft != null) {
      setQuery(activeDraft.query);
    }
    closeDraft();
  };

  const startEditing = (
    itemIndex: number,
    stageIndex: number,
    filter: Lib.FilterClause,
    initialState: DraftState,
    part: FilterPillPart,
  ) => {
    setActiveDraft({
      key: -(itemIndex + 1),
      query,
      stageIndex,
      filter,
      initialState,
      initialEditedPart: part === "values" ? undefined : part,
      itemIndex,
    });
  };

  if (!expanded) {
    return null;
  }

  const draftPill = activeDraft != null && (
    <DraftFilterPill
      key={activeDraft.key}
      query={activeDraft.query}
      stageIndex={activeDraft.stageIndex}
      filter={activeDraft.filter}
      initialState={activeDraft.initialState}
      initialEditedPart={activeDraft.initialEditedPart}
      isClickOutsideApply={clickOutsideMode === "apply"}
      onDraftChange={handleDraftChange}
      onSubmit={handleSubmit}
      onSubmitFilters={handleSubmitFilters}
      onDone={closeDraft}
      onCancel={handleCancel}
    />
  );

  return (
    <Flex
      className={S.row}
      align="center"
      wrap="wrap"
      gap="sm"
      py="sm"
      data-testid="keyboard-filter-row"
    >
      <Tooltip label={t`Add a filter (F)`}>
        <button
          ref={addButtonRef}
          className={S.addButton}
          aria-label={t`Add filter`}
          onClick={onAddDraft}
        >
          <Icon name="add" />
        </button>
      </Tooltip>
      {items.map(({ filter, filterIndex, stageIndex }, itemIndex) => {
        if (activeDraft?.itemIndex === itemIndex) {
          return draftPill;
        }
        const { newFilterPosition } = activeDraft ?? {};
        if (
          newFilterPosition?.stageIndex === stageIndex &&
          newFilterPosition.filterIndex === filterIndex
        ) {
          return null;
        }
        const initialState =
          editingMode === "inline"
            ? getDraftStateFromFilter(query, stageIndex, filter)
            : undefined;
        const { column, operator } = initialState ?? {};
        if (initialState == null || column == null || operator == null) {
          return (
            <PopoverFilterPill
              key={itemIndex}
              query={query}
              stageIndex={stageIndex}
              filter={filter}
              filterIndex={filterIndex}
              onChange={(newQuery) => setQuery(Lib.dropEmptyStages(newQuery))}
            />
          );
        }
        const edit = (part: FilterPillPart) =>
          startEditing(itemIndex, stageIndex, filter, initialState, part);
        return (
          <div
            key={itemIndex}
            className={S.pill}
            data-testid="filter-pill"
            onClick={() => edit("values")}
          >
            <FilterPillParts
              columnLabel={column.label}
              operator={operator}
              values={initialState.values}
              onPartClick={edit}
            />
            <Icon
              className={S.removeIcon}
              name="close"
              size={12}
              role="button"
              aria-label={t`Remove filter`}
              onClick={(event) => {
                event.stopPropagation();
                setQuery(
                  Lib.dropEmptyStages(
                    Lib.removeClause(query, stageIndex, filter),
                  ),
                );
              }}
            />
          </div>
        );
      })}
      {activeDraft?.itemIndex == null && draftPill}
    </Flex>
  );
}

type RenderCheckOpts = {
  question: Question;
  queryBuilderMode: QueryBuilderMode;
};

KeyboardFilterRow.shouldRender = ({
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
