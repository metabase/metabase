import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";

import _ from "underscore";

const STEPS = [
  {
    type: "data",
    valid: query => !query.sourceQuery(),
    visible: query => true,
    clean: query => query,
  },
  {
    type: "join",
    valid: query => !!query.table() && query.database().hasFeature("join"),
    visible: query => query.joins().length > 0,
    revert: query => query.clearJoins(),
    clean: query => query.cleanJoins(),
  },
  {
    type: "expression",
    valid: query =>
      !!query.table() && query.database().hasFeature("expressions"),
    visible: query => Object.keys(query.expressions()).length > 0,
    revert: query => query.clearExpressions(),
    clean: query => query, // TODO
  },
  {
    type: "filter",
    valid: query => !!query.table(),
    visible: query => query.filters().length > 0,
    revert: query => query.clearFilters(),
    clean: query => query.cleanFilters(),
  },
  // {
  //   type: "aggregate",
  //   valid: query => !!query.table(),
  //   visible: query => query.aggregations().length > 0,
  //   revert: query => query.clearAggregations(),
  //   clean: query => query.cleanAggregations(),
  // },
  // {
  //   type: "breakout",
  //   valid: query => !!query.table() && query.aggregations().length > 0,
  //   visible: query => query.breakouts().length > 0,
  //   revert: query => query.clearBreakouts(),
  //   clean: query => query.cleanBreakouts(),
  // },
  {
    type: "summarize",
    valid: query => !!query.table(),
    visible: query =>
      query.aggregations().length > 0 || query.breakouts().length > 0,
    revert: query => query.clearBreakouts().clearAggregations(),
    clean: query => query.cleanBreakouts().cleanAggregations(),
  },
  {
    type: "sort",
    valid: query =>
      !!query.table() &&
      (query.aggregations().length === 0 || query.breakouts().length > 0),
    visible: query => query.sorts().length > 0,
    revert: query => query.clearSort(),
    clean: query => query.cleanSorts(),
  },
  {
    type: "limit",
    valid: query =>
      !!query.table() &&
      (query.aggregations().length === 0 || query.breakouts().length > 0),
    visible: query => query.limit() != null,
    revert: query => query.clearLimit(),
    clean: query => query.cleanLimit(),
  },
];

// allow nesting after these steps:
const NEST_LAST_TYPES = new Set(["join", "summarize", "sort", "limit"]);
// allow these actions after nesting:
const NEST_NEXT_TYPES = new Set(["join", "filter", "summarize"]);
/**
 * Returns an array of "steps" to be displayed in the notebook for one "stage" (nesting) of a query
 */
export function getQuestionSteps(question, openSteps) {
  const steps = [];

  const query = question.query();
  if (query instanceof StructuredQuery) {
    for (const [stageIndex, stageQuery] of query.queries().entries()) {
      const stageSteps = getStageSteps(stageQuery, stageIndex, openSteps);
      steps.push(...stageSteps);
    }

    const database = question.database();
    if (database && database.hasFeature("nested-queries")) {
      const activeSteps = steps.filter(s => s.active);
      const last = activeSteps[activeSteps.length - 1];
      const lastActionTypes = new Set(last.actions.map(a => a.type));
      if (NEST_LAST_TYPES.has(last.type)) {
        for (const type of NEST_NEXT_TYPES) {
          if (!lastActionTypes.has(type)) {
            last.actions.push({
              type: type,
              action: ({ query, openStep }) => {
                query.nest().update();
                openStep(`${last.stage + 1}:${type}`);
              },
            });
          }
        }
      }
    }
  }

  return steps;
}

/**
 * Returns an array of "steps" to be displayed in the notebook for one "stage" (nesting) of a query
 */
export function getStageSteps(query, stageIndex, openSteps) {
  const getId = step => `${stageIndex}:${step.type}`;

  // get the currently visible steps
  const steps = STEPS.filter(
    STEP =>
      STEP.valid(query) && (STEP.visible(query) || openSteps[getId(STEP)]),
  ).map(STEP => ({
    stage: stageIndex,
    type: STEP.type,
    step: STEP,
    id: getId(STEP),
    query: query,
    actions: [],
  }));

  // sort/limit not currently covered by steps so revert them manually
  let previewQuery = query; //.clearSort().clearLimit();

  let actions = [];
  // iterate over steps in reverse so we can revert query for previewing and accumulate valid actions
  for (let i = STEPS.length - 1; i >= 0; i--) {
    const STEP = STEPS[i];
    const step = _.findWhere(steps, { type: STEP.type });
    if (step) {
      step.active = STEP.visible(query);
      // only include previewQuery if the section would be visible (i.e. excluding "openSteps")
      step.previewQuery = step.active ? previewQuery : null;
      // add any accumulated actions and reset
      step.actions = actions;
      actions = [];
    } else {
      // if the step isn't visible but it's valid add it to the `actions` accumulator
      if (STEP.valid(query)) {
        actions.unshift({
          type: STEP.type,
          action: ({ openStep }) => openStep(getId(STEP)),
        });
      }
    }
    // revert the previewQuery for this step
    if (STEP.revert) {
      previewQuery = STEP.revert(previewQuery);
    }
  }

  return steps;
}
