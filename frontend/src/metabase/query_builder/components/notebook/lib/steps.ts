import _ from "underscore";

import * as Lib from "metabase-lib";
import type { Query } from "metabase-lib/types";
import type Metadata from "metabase-lib/metadata/Metadata";
import type Question from "metabase-lib/Question";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";

import type { NotebookStep, NotebookStepFn, OpenSteps } from "../types";

// This converts an MBQL query into a sequence of notebook "steps", with special logic to determine which steps are
// allowed to be added at every other step, generating a preview query at each step, how to delete a step,
// ensuring steps that become invalid after modifying an upstream step are removed, etc.

// identifier for this step, e.x. `0:data` (or `0:join:1` for sub-steps)

type NotebookStepDef = Pick<NotebookStep, "type" | "revert"> & {
  valid: NotebookStepFn<boolean>;
  active: NotebookStepFn<boolean>;
  subSteps?: (query: Lib.Query, stageIndex: number) => number;
};

const STEPS: NotebookStepDef[] = [
  {
    type: "data",
    valid: query => !query.sourceQuery(),
    active: _query => true,
    revert: null, // this step is non-reversible (i.e. non-removable)
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
    revert: (query, stageIndex, index) => {
      if (typeof index !== "number") {
        return query;
      }

      const join = Lib.joins(query, stageIndex)[index];

      if (!join) {
        return query;
      }

      return Lib.removeClause(query, stageIndex, join);
    },
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
    revert: (query, stageIndex) => {
      const expressions = Lib.expressions(query, stageIndex);

      return expressions.reduce((query, expression) => {
        return Lib.removeClause(query, stageIndex, expression);
      }, query);
    },
  },
  {
    type: "filter",
    valid: query => query.hasData(),
    active: query => query.hasFilters(),
    revert: (query, stageIndex) => {
      const filters = Lib.filters(query, stageIndex);

      return filters.reduce((query, filter) => {
        return Lib.removeClause(query, stageIndex, filter);
      }, query);
    },
  },
  {
    // NOTE: summarize is a combination of aggregate and breakout
    type: "summarize",
    valid: query => query.hasData(),
    active: query => query.hasAggregations() || query.hasBreakouts(),
    revert: (query, stageIndex) => {
      const clauses = [
        ...Lib.aggregations(query, stageIndex),
        ...Lib.breakouts(query, stageIndex),
      ];

      return clauses.reduce((query, clause) => {
        return Lib.removeClause(query, stageIndex, clause);
      }, query);
    },
  },
  {
    type: "sort",
    valid: query =>
      query.hasData() &&
      (!query.hasAggregations() || query.hasBreakouts()) &&
      (!query.sourceQuery() || query.hasAnyClauses()),
    active: (legacyQuery, itemIndex, query, stageIndex) =>
      Lib.orderBys(query, stageIndex).length > 0,
    revert: (query, stageIndex) => {
      return Lib.clearOrderBys(query, stageIndex);
    },
  },
  {
    type: "limit",
    valid: query =>
      query.hasData() &&
      (!query.hasAggregations() || query.hasBreakouts()) &&
      (!query.sourceQuery() || query.hasAnyClauses()),
    active: (legacyQuery, itemIndex, query, stageIndex) =>
      Lib.hasLimit(query, stageIndex),
    revert: (query, stageIndex) => {
      return Lib.limit(query, stageIndex, null);
    },
  },
];

/**
 * Returns an array of "steps" to be displayed in the notebook for one "stage" (nesting) of a query
 */
export function getQuestionSteps(
  question: Question,
  metadata: Metadata,
  openSteps: OpenSteps,
) {
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
        metadata,
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
  metadata: Metadata,
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
      valid: STEP.valid(
        stageQuery,
        itemIndex,
        topLevelQuery,
        stageIndex,
        metadata,
      ),
      active: STEP.active(
        stageQuery,
        itemIndex,
        topLevelQuery,
        stageIndex,
        metadata,
      ),
      visible:
        STEP.valid(
          stageQuery,
          itemIndex,
          topLevelQuery,
          stageIndex,
          metadata,
        ) &&
        !!(
          STEP.active(
            stageQuery,
            itemIndex,
            topLevelQuery,
            stageIndex,
            metadata,
          ) || openSteps[id]
        ),
      testID: getTestId(STEP, itemIndex),
      revert: STEP.revert
        ? (query: Lib.Query) =>
            STEP.revert
              ? STEP.revert(query, stageIndex, itemIndex ?? undefined)
              : null
        : null,
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

  let previewQuery: Lib.Query | null = topLevelQuery;

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
        step.stageIndex,
        step.itemIndex ?? undefined,
      );
    }
  }

  return { steps, actions };
}
