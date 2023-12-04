import _ from "underscore";

import * as Lib from "metabase-lib";
import type { Query } from "metabase-lib/types";
import type Question from "metabase-lib/Question";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";

import type { NotebookStep, NotebookStepFn, OpenSteps } from "../types";

// This converts an MBQL query into a sequence of notebook "steps", with special logic to determine which steps are
// allowed to be added at every other step, generating a preview query at each step, how to delete a step,
// ensuring steps that become invalid after modifying an upstream step are removed, etc.

// identifier for this step, e.x. `0:data` (or `0:join:1` for sub-steps)

type NotebookStepDef = Pick<NotebookStep, "type" | "clean" | "revert"> & {
  valid: NotebookStepFn<boolean>;
  active: NotebookStepFn<boolean>;
  subSteps?: (query: Lib.Query, stageIndex: number) => number;
};

function convertStageQueryToLegacyStageQuery(
  query: Query,
  legacyQuery: StructuredQuery,
  stageIndex: number,
) {
  const legacyDatasetQuery = Lib.toLegacyQuery(query);
  const legacyStructuredQuery = legacyQuery.setDatasetQuery(legacyDatasetQuery);
  const stagedLegacyQueries = legacyStructuredQuery.queries();
  return stagedLegacyQueries[stageIndex];
}

const STEPS: NotebookStepDef[] = [
  {
    type: "data",
    valid: query => !query.sourceQuery(),
    active: _query => true,
    clean: query => query,
    revert: null,
  },
  {
    type: "join",
    valid: query => {
      const database = query.database();
      return query.hasData() && database != null && database.hasFeature("join");
    },
    subSteps: (topLevelQuery, stageIndex) =>
      Lib.joins(topLevelQuery, stageIndex).length,
    active: (legacyQuery, index, topLevelQuery, stageIndex) =>
      typeof index === "number" &&
      Lib.joins(topLevelQuery, stageIndex).length > index,
    revert: (legacyQuery, index, topLevelQuery, stageIndex) => {
      if (typeof index !== "number") {
        return legacyQuery;
      }
      const join = Lib.joins(topLevelQuery, stageIndex)[index];
      if (!join) {
        return legacyQuery;
      }
      const nextQuery = Lib.removeClause(topLevelQuery, stageIndex, join);
      return convertStageQueryToLegacyStageQuery(
        nextQuery,
        legacyQuery,
        stageIndex,
      );
    },
    clean: query => query,
  },
  {
    type: "expression",
    valid: query => {
      const database = query.database();
      return (
        query.hasData() && database != null && database.supportsExpressions()
      );
    },
    active: query => query.hasExpressions(),
    revert: query => query.clearExpressions(),
    clean: query => query.cleanExpressions(),
  },
  {
    type: "filter",
    valid: query => query.hasData(),
    active: query => query.hasFilters(),
    revert: query => query.clearFilters(),
    clean: query => query.cleanFilters(),
  },
  {
    // NOTE: summarize is a combination of aggregate and breakout
    type: "summarize",
    valid: query => query.hasData(),
    active: query => query.hasAggregations() || query.hasBreakouts(),
    revert: query =>
      // only clear if there are aggregations or breakouts because it will also clear `fields`
      query.hasAggregations() || query.hasBreakouts()
        ? query.clearBreakouts().clearAggregations()
        : query,
    clean: query => query,
  },
  {
    type: "sort",
    valid: query =>
      query.hasData() &&
      (!query.hasAggregations() || query.hasBreakouts()) &&
      (!query.sourceQuery() || query.hasAnyClauses()),
    active: (legacyQuery, itemIndex, query, stageIndex) =>
      Lib.orderBys(query, stageIndex).length > 0,
    revert: (legacyQuery, itemIndex, query, stageIndex) => {
      const reverted = Lib.clearOrderBys(query, stageIndex);
      return convertStageQueryToLegacyStageQuery(
        reverted,
        legacyQuery,
        stageIndex,
      );
    },

    // Order-bys can only be added from the notebook editor with MLv2.
    // MLv2 guarantees that a query is valid at any given point of time,
    // so we can skip order-bys cleaning.
    clean: query => query,
  },
  {
    type: "limit",
    valid: query =>
      query.hasData() &&
      (!query.hasAggregations() || query.hasBreakouts()) &&
      (!query.sourceQuery() || query.hasAnyClauses()),
    active: (legacyQuery, itemIndex, query, stageIndex) =>
      Lib.hasLimit(query, stageIndex),
    revert: (legacyQuery, itemIndex, query, stageIndex) => {
      const reverted = Lib.limit(query, stageIndex, null);
      return convertStageQueryToLegacyStageQuery(
        reverted,
        legacyQuery,
        stageIndex,
      );
    },
    clean: query => query,
  },
];

/**
 * Returns an array of "steps" to be displayed in the notebook for one "stage" (nesting) of a query
 */
export function getQuestionSteps(question: Question, openSteps = {}) {
  const allSteps: NotebookStep[] = [];

  if (question.isStructured()) {
    let query = question.query() as StructuredQuery;

    let topLevelQuery = query.rootQuery().question()._getMLv2Query();

    const database = question.database();
    const allowsNesting = database && database.hasFeature("nested-queries");

    // strip empty source queries
    query = query.cleanNesting();

    // add a level of nesting, if valid
    if (allowsNesting && query.hasBreakouts()) {
      query = query.nest();
      topLevelQuery = Lib.appendStage(topLevelQuery);
    }

    const stagedQueries = query.queries();
    for (const [stageIndex, stageQuery] of stagedQueries.entries()) {
      const { steps, actions } = getStageSteps(
        topLevelQuery,
        stageQuery,
        stageIndex,
        openSteps,
      );
      // append actions to last step of previous stage
      if (allSteps.length > 0) {
        allSteps[allSteps.length - 1].actions.push(...actions);
      }
      allSteps.push(...steps);
    }
  }

  // set up pointers to the next and previous steps
  for (const [index, step] of allSteps.entries()) {
    step.previous = allSteps[index - 1];
    step.next = allSteps[index + 1];
  }

  return allSteps;
}

/**
 * Returns an array of "steps" to be displayed in the notebook for one "stage" (nesting) of a query
 */
function getStageSteps(
  topLevelQuery: Query,
  stageQuery: StructuredQuery,
  stageIndex: number,
  openSteps: OpenSteps,
) {
  const getId = (step: NotebookStepDef, itemIndex: number | null) => {
    const isValidItemIndex = itemIndex != null && itemIndex > 0;
    return (
      `${stageIndex}:${step.type}` + (isValidItemIndex ? `:${itemIndex}` : "")
    );
  };

  const getTestId = (step: NotebookStepDef, itemIndex: number | null) => {
    const isValidItemIndex = itemIndex != null && itemIndex > 0;
    const finalItemIndex = isValidItemIndex ? itemIndex : 0;
    return `step-${step.type}-${stageIndex}-${finalItemIndex}`;
  };

  function getStep(STEP: NotebookStepDef, itemIndex: number | null = null) {
    const id = getId(STEP, itemIndex);
    const step: NotebookStep = {
      id: id,
      type: STEP.type,
      stageIndex: stageIndex,
      itemIndex: itemIndex,
      topLevelQuery,
      query: stageQuery,
      valid: STEP.valid(stageQuery, itemIndex, topLevelQuery, stageIndex),
      active: STEP.active(stageQuery, itemIndex, topLevelQuery, stageIndex),
      visible:
        STEP.valid(stageQuery, itemIndex, topLevelQuery, stageIndex) &&
        !!(
          STEP.active(stageQuery, itemIndex, topLevelQuery, stageIndex) ||
          openSteps[id]
        ),
      testID: getTestId(STEP, itemIndex),
      revert: STEP.revert
        ? (query: StructuredQuery) =>
            STEP.revert
              ? STEP.revert(query, itemIndex, topLevelQuery, stageIndex)
              : null
        : null,
      clean: query => STEP.clean(query, itemIndex, topLevelQuery, stageIndex),
      update: datasetQuery => {
        let newQuery = stageQuery.setDatasetQuery(datasetQuery);
        // clean each subsequent step individually. we have to do this rather than calling newQuery.clean() in case
        // the current step is in a temporarily invalid state
        let current: NotebookStep | null = step;
        while ((current = current.next)) {
          // when switching to the next stage we need to setSourceQuery
          if (
            current.previous &&
            current.previous.stageIndex < current.stageIndex
          ) {
            newQuery = current.query.setSourceQuery(newQuery.query());
          }
          newQuery = current.clean(
            newQuery,
            current.itemIndex,
            topLevelQuery,
            current.stageIndex,
          );
        }
        // strip empty source queries
        return newQuery.cleanNesting();
      },
      // `actions`, `previewQuery`, `next` and `previous` will be set later
      actions: [],
      previewQuery: null,
      next: null,
      previous: null,
    };
    return step;
  }

  // get the currently visible steps, flattening "items"
  const steps = _.flatten(
    STEPS.map(STEP => {
      if (STEP.subSteps) {
        // add 1 for the initial or next action button
        const itemIndexes = _.range(
          0,
          STEP.subSteps(topLevelQuery, stageIndex) + 1,
        );
        return itemIndexes.map(itemIndex => getStep(STEP, itemIndex));
      } else {
        return [getStep(STEP)];
      }
    }),
  );

  let previewQuery: StructuredQuery | null = stageQuery;

  let actions = [];
  // iterate over steps in reverse so we can revert query for previewing and accumulate valid actions
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i];
    if (step.visible) {
      // only include previewQuery if the section would be visible (i.e. excluding "openSteps")
      step.previewQuery = step.active ? previewQuery : null;
      // add any accumulated actions and reset
      step.actions = actions;
      actions = [];
    } else {
      // if the step isn't visible but it's valid add it to the `actions` accumulator
      if (step.valid) {
        actions.unshift({
          type: step.type,
          action: ({
            openStep,
          }: {
            openStep: (id: NotebookStep["id"]) => void;
          }) => openStep(step.id),
        });
      }
      steps.splice(i, 1);
    }
    // revert the previewQuery for this step
    if (step.revert && previewQuery) {
      previewQuery = step.revert(
        previewQuery,
        step.itemIndex,
        topLevelQuery,
        step.stageIndex,
      );
    }
  }

  return { steps, actions };
}
