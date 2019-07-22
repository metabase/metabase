import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";

import _ from "underscore";

const STEPS = [
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
export function getQuestionSteps(question, openSteps = {}) {
  const allSteps = [];

  let query = question.query();
  if (query instanceof StructuredQuery) {
    const database = question.database();
    const allowsNesting = database && database.hasFeature("nested-queries");

    // strip empty source queries
    while (query.sourceQuery() && !query.hasAnyClauses()) {
      query = query.sourceQuery();
    }

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

  return allSteps;
}

/**
 * Returns an array of "steps" to be displayed in the notebook for one "stage" (nesting) of a query
 */
export function getStageSteps(query, stageIndex, openSteps) {
  const getId = (step, itemIndex) =>
    `${stageIndex}:${step.type}` + (itemIndex > 0 ? `:${itemIndex}` : ``);

  function getStep(STEP, itemIndex = null) {
    return {
      id: getId(STEP, itemIndex),
      type: STEP.type,
      stageIndex: stageIndex,
      itemIndex: itemIndex,
      query: query,
      valid: STEP.valid(query, itemIndex),
      active: STEP.active(query, itemIndex),
      visible:
        STEP.valid(query, itemIndex) &&
        (STEP.active(query, itemIndex) || openSteps[getId(STEP, itemIndex)]),
      revert: STEP.revert ? query => STEP.revert(query, itemIndex) : null,
      clean: query => STEP.clean(query, itemIndex),
      actions: [],
    };
  }

  // get the currently visible steps, flattening "items"
  const steps = _.flatten(
    STEPS.map(STEP => {
      if (STEP.subSteps) {
        // add 1 for the initial or next action button
        const itemIndexes = _.range(0, STEP.subSteps(query) + 1);
        return itemIndexes.map(itemIndex => getStep(STEP, itemIndex));
      } else {
        return [getStep(STEP)];
      }
    }),
  );

  let previewQuery = query;

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
