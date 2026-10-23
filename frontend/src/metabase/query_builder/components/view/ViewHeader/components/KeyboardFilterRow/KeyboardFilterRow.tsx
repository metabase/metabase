import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLatest } from "react-use";
import { t } from "ttag";

import { skipToken, useGetPrototypeFilterSummaryQuery } from "metabase/api";
import {
  FILTER_SUMMARY_DELAY_MS,
  FILTER_SUMMARY_TRIGGER,
  usePrototypeSetting,
} from "metabase/prototype";
import { getFilterItems } from "metabase/querying/filters/components/FilterPanel/utils";
import { FilterAutoApplyContext } from "metabase/querying/filters/components/FilterPicker/FilterAutoApplyContext";
import type { QueryBuilderMode } from "metabase/redux/store";
import { Flex, Icon, Tooltip } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import {
  areQueriesEqual,
  getQueryWithFilter,
} from "../../../FilterAutoApply/utils";

import { type DraftChangeSource, DraftFilterPill } from "./DraftFilterPill";
import { type FilterPillPart, FilterPillParts } from "./FilterPillParts";
import S from "./KeyboardFilterRow.module.css";
import { PopoverFilterPill } from "./PopoverFilterPill";
import type { DraftState } from "./types";
import {
  formatDraftValue,
  getDraftStateFromFilter,
  getPillOperatorLabel,
} from "./utils";

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

/** In the "saved" mode, the wait after the pointer leaves the filter bar. */
const SAVED_SUMMARY_DELAY_MS = 1000;

interface KeyboardFilterRowProps {
  question: Question;
  /** True when the question has changes that are not saved. */
  isDirty: boolean;
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
 * Prototype: the filter pills of the question, with a button that adds a new
 * filter as a pill with an input. On data where filters apply as the user
 * changes them, the pill applies its filter at each change.
 */
export function KeyboardFilterRow({
  question,
  isDirty,
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
  const autoApply = useContext(FilterAutoApplyContext);
  const latestQuestion = useLatest(question);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

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
      // Prototype: on slow data, a filter change only makes the result out of
      // date, and the user reruns the question with the run button.
      const isSlowData = !(autoApply?.isEnabled(newQuery) ?? true);
      updateQuestion(question.setQuery(newQuery), {
        run: !isSlowData,
        shouldUpdateUrl: isSlowData,
      });
    }
  };

  const applyDraft = (
    draft: ActiveDraft,
    filter: Lib.ExpressionClause | Lib.SegmentMetadata,
  ) => {
    setQuery(
      getQueryWithFilter(draft.query, draft.stageIndex, draft.filter, filter),
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

  const handleRemove = () => {
    if (activeDraft?.filter != null) {
      const { query, stageIndex, filter } = activeDraft;
      setQuery(
        Lib.dropEmptyStages(Lib.removeClause(query, stageIndex, filter)),
      );
      closeDraft();
    } else {
      handleCancel();
    }
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

  const { summary, onMouseEnter, onMouseLeave, onShowPills } = useFilterSummary(
    {
      question,
      query,
      items,
      isDirty,
      isEditing: activeDraft != null,
    },
  );

  if (!expanded) {
    return null;
  }

  if (summary != null) {
    return (
      <Flex
        className={S.row}
        align="center"
        py="sm"
        data-testid="keyboard-filter-row"
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        <button
          className={S.filterSummary}
          data-testid="filter-summary"
          onClick={onShowPills}
        >
          <Icon name="filter" size={14} />
          <span>{summary}</span>
        </button>
      </Flex>
    );
  }

  const draftPill = activeDraft != null && (
    <DraftFilterPill
      key={activeDraft.key}
      query={activeDraft.query}
      stageIndex={activeDraft.stageIndex}
      filter={activeDraft.filter}
      initialState={activeDraft.initialState}
      initialEditedPart={activeDraft.initialEditedPart}
      onDraftChange={handleDraftChange}
      onSubmit={handleSubmit}
      onSubmitFilters={handleSubmitFilters}
      onDone={closeDraft}
      onCancel={handleCancel}
      onRemove={handleRemove}
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
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
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
        const initialState = getDraftStateFromFilter(query, stageIndex, filter);
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

interface UseFilterSummaryOpts {
  question: Question;
  query: Lib.Query;
  items: ReturnType<typeof getFilterItems>;
  isDirty: boolean;
  isEditing: boolean;
}

/**
 * Prototype: a short AI summary that replaces the filter pills. It shows after
 * a time with no activity in the filter bar, or when the question is saved,
 * by the prototype setting. The pointer over the filter bar shows the pills.
 */
function useFilterSummary({
  question,
  query,
  items,
  isDirty,
  isEditing,
}: UseFilterSummaryOpts) {
  const [trigger] = usePrototypeSetting(FILTER_SUMMARY_TRIGGER);
  const [delayMs] = usePrototypeSetting(FILTER_SUMMARY_DELAY_MS);
  const [isHovered, setIsHovered] = useState(false);
  const [isSummarized, setIsSummarized] = useState(false);

  const filterTexts = useMemo(
    () =>
      items.map(({ filter, stageIndex }) =>
        getFilterText(query, stageIndex, filter),
      ),
    [items, query],
  );
  const isEnabled = trigger !== "off" && filterTexts.length > 0;
  const { currentData } = useGetPrototypeFilterSummaryQuery(
    isEnabled
      ? {
          question_name: question.displayName() ?? undefined,
          filters: filterTexts,
        }
      : skipToken,
  );
  const summary = currentData?.summary ?? null;

  const canSummarize =
    summary != null &&
    !isEditing &&
    !isHovered &&
    (trigger === "inactivity" || (question.isSaved() && !isDirty));

  // Each change of the query starts the wait again.
  useEffect(() => {
    if (!canSummarize) {
      setIsSummarized(false);
      return;
    }
    const timeout = setTimeout(
      () => setIsSummarized(true),
      trigger === "saved" ? SAVED_SUMMARY_DELAY_MS : delayMs,
    );
    return () => clearTimeout(timeout);
  }, [canSummarize, trigger, delayMs, query]);

  return {
    summary: isSummarized ? summary : null,
    onMouseEnter: () => setIsHovered(true),
    onMouseLeave: () => setIsHovered(false),
    onShowPills: () => setIsSummarized(false),
  };
}

/**
 * The text of a filter pill, with all its values. The display name of a filter
 * hides many values, like "Plan is 2 selections".
 */
function getFilterText(
  query: Lib.Query,
  stageIndex: number,
  filter: Lib.FilterClause,
) {
  const state = getDraftStateFromFilter(query, stageIndex, filter);
  const { column, operator, values = [] } = state ?? {};
  if (column == null || operator == null) {
    return Lib.displayInfo(query, stageIndex, filter).displayName;
  }
  const separator = operator.valueKind === "range" ? ` ${t`and`} ` : ", ";
  return [
    column.label,
    getPillOperatorLabel(operator),
    values.map((value) => formatDraftValue(operator, value)).join(separator),
  ]
    .filter((part) => part.length > 0)
    .join(" ");
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
