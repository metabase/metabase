/* @flow weak */

import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import type Question from "metabase-lib/lib/Question";

import type { StructuredDatasetQuery } from "metabase-types/types/Card";

import _ from "underscore";

// This converts an MBQL query into a sequence of notebook "steps", with special logic to determine which steps are
// allowed to be added at every other step, generating a preview query at each step, how to delete a step,
// ensuring steps that become invalid after modifying an upstream step are removed, etc.

type StepType =
  | "data"
  | "join"
  | "expression"
  | "filter"
  | "summarize"
  | "sort"
  | "limit";

type StepDefinition = NormalStepDefinition | SubStepDefinition;

type NormalStepDefinition = {
  // a type name for the step
  type: StepType,
  // returns true if the step can be added to the provided query
  valid: (query: StructuredQuery) => boolean,
  // returns true if the provided query already has this step
  active: (query: StructuredQuery) => boolean,
  // logic to remove invalid clauses that were added by this step from the provided query
  clean: (query: StructuredQuery) => StructuredQuery,
  // logic to remove this step from the provided query
  revert?: (query: StructuredQuery) => StructuredQuery,
};

type SubStepDefinition = {
  // a type name for the step
  type: StepType,
  // returns true if the step can be added to the provided query
  valid: (query: StructuredQuery, subStepIndex: number) => boolean,
  // returns true if the provided query already has this step
  active: (query: StructuredQuery, subStepIndex: number) => boolean,
  // logic to remove invalid clauses that were added by this step from the provided query
  clean: (query: StructuredQuery, subStepIndex: number) => StructuredQuery,
  // logic to remove this step from the provided query
  revert?: (query: StructuredQuery, subStepIndex: number) => StructuredQuery,
  // how many sub-steps are there
  subSteps?: (query: StructuredQuery) => number,
};

// identifier for this step, e.x. `0:data` (or `0:join:1` for sub-steps)
type StepId = string;

type Step = {
  id: StepId,
  // the step type, corresponds with type in StepDefinition
  type: StepType,
  // if there are nested queries, this indicates the level of nested (0 being the root query)
  stageIndex: number,
  // if there are sub-steps, this indicates the index of the sub-step
  itemIndex: number,
  // is this step currently allowed?
  valid: boolean,
  // is this step currently applied?
  active: boolean,
  // is this step visible? (if it's active or just added)
  visible: boolean,
  // the query for this "stage"
  query: StructuredQuery,
  // a query to preview query at this step
  previewQuery: ?StructuredQuery,
  // remove this step
  revert: ?(query: StructuredQuery) => StructuredQuery,
  // remove invalid clauses set by this step
  clean: (query: StructuredQuery) => StructuredQuery,
  // update the query at this step and clean subsequent queries
  update: (datasetQuery: StructuredDatasetQuery) => StructuredQuery,
  // any valid actions that can be applied after this step
  actions: StepAction[],
  // pointer to the next step, if any
  next: ?Step,
  // pointer to the previous step, if any
  previous: ?Step,
};

type StepAction = {
  type: StepType,
  action: Function,
};

type OpenSteps = {
  [id: StepId]: boolean,
};

const STEPS: StepDefinition[] = [
  {
    type: "data",
    valid: query => !query.sourceQuery(),
    active: query => true,
    clean: query => query,
  },
  {
    type: "join",
    valid: query => query.hasData() && query.database().hasFeature("join"),
    // active: query => query.hasJoins(),
    // revert: query => query.clearJoins(),
    // clean: query => query.cleanJoins(),
    subSteps: query => query.joins().length,
    active: (query, index) => query.joins().length > index,
    revert: (query, index) => query.removeJoin(index),
    clean: (query, index) => {
      const join = query.joins()[index];
      return !join || join.isValid() ? query : query.removeJoin(index);
    },
  },
  {
    type: "expression",
    valid: query =>
      query.hasData() && query.database().hasFeature("expressions"),
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
  // {
  //   type: "aggregate",
  //   valid: query => query.hasData(),
  //   active: query => query.hasAggregations,
  //   revert: query => query.clearAggregations(),
  //   clean: query => query.cleanAggregations(),
  // },
  // {
  //   type: "breakout",
  //   valid: query => query.hasData() && query.hasAggregations() ,
  //   active: query => query.hasBreakouts(),
  //   revert: query => query.clearBreakouts(),
  //   clean: query => query.cleanBreakouts(),
  // },
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
    clean: query => query.cleanBreakouts().cleanAggregations(),
  },
  {
    type: "sort",
    valid: query =>
      query.hasData() &&
      (!query.hasAggregations() || query.hasBreakouts()) &&
      (!query.sourceQuery() || query.hasAnyClauses()),
    active: query => query.hasSorts(),
    revert: query => query.clearSort(),
    clean: query => query.cleanSorts(),
  },
  {
    type: "limit",
    valid: query =>
      query.hasData() &&
      (!query.hasAggregations() || query.hasBreakouts()) &&
      (!query.sourceQuery() || query.hasAnyClauses()),
    active: query => query.hasLimit(),
    revert: query => query.clearLimit(),
    clean: query => query.cleanLimit(),
  },
];

/**
 * Returns an array of "steps" to be displayed in the notebook for one "stage" (nesting) of a query
 */
export function getQuestionSteps(
  question: Question,
  openSteps: OpenSteps = {},
): Step[] {
  const allSteps = [];

  let query = question.query();
  if (query instanceof StructuredQuery) {
    const database = question.database();
    const allowsNesting = database && database.hasFeature("nested-queries");

    // strip empty source queries
    query = query.cleanNesting();

    // add a level of nesting, if valid
    if (allowsNesting && query.hasBreakouts()) {
      query = query.nest();
    }

    for (const [stageIndex, stageQuery] of query.queries().entries()) {
      const { steps, actions } = getStageSteps(
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
export function getStageSteps(
  stageQuery: StructuredQuery,
  stageIndex: number,
  openSteps: OpenSteps,
): { steps: Step[], actions: StepAction[] } {
  const getId = (step, itemIndex) =>
    `${stageIndex}:${step.type}` + (itemIndex > 0 ? `:${itemIndex}` : ``);

  function getStep(STEP, itemIndex = null) {
    const id = getId(STEP, itemIndex);
    const step: Step = {
      id: id,
      type: STEP.type,
      stageIndex: stageIndex,
      itemIndex: itemIndex,
      query: stageQuery,
      valid: STEP.valid(stageQuery, itemIndex),
      active: STEP.active(stageQuery, itemIndex),
      visible:
        STEP.valid(stageQuery, itemIndex) &&
        (STEP.active(stageQuery, itemIndex) || openSteps[id]),
      revert: STEP.revert ? query => STEP.revert(query, itemIndex) : null,
      clean: query => STEP.clean(query, itemIndex),
      update: datasetQuery => {
        let newQuery = stageQuery.setDatasetQuery(datasetQuery);
        // clean each subsequent step individually. we have to do this rather than calling newQuery.clean() in case
        // the current step is in a temporarily invalid state
        let current = step;
        while ((current = current.next)) {
          // when switching to the next stage we need to setSourceQuery
          if (
            current.previous &&
            current.previous.stageIndex < current.stageIndex
          ) {
            newQuery = current.query.setSourceQuery(newQuery.query());
          }
          newQuery = current.clean(newQuery);
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
        const itemIndexes = _.range(0, STEP.subSteps(stageQuery) + 1);
        return itemIndexes.map(itemIndex => getStep(STEP, itemIndex));
      } else {
        return [getStep(STEP)];
      }
    }),
  );

  let previewQuery = stageQuery;

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
          action: ({ openStep }) => openStep(step.id),
        });
      }
      steps.splice(i, 1);
    }
    // revert the previewQuery for this step
    if (step.revert) {
      previewQuery = step.revert(previewQuery);
    }
  }

  return { steps, actions };
}
