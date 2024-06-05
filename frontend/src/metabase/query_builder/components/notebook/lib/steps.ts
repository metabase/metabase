import _ from "underscore";

import { checkNotNull } from "metabase/lib/types";
import type { Query } from "metabase-lib";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type Metadata from "metabase-lib/v1/metadata/Metadata";

import type { NotebookStep, OpenSteps } from "../types";

// This converts an MBQL query into a sequence of notebook "steps", with special logic to determine which steps are
// allowed to be added at every other step, generating a preview query at each step, how to delete a step,
// ensuring steps that become invalid after modifying an upstream step are removed, etc.

// identifier for this step, e.x. `0:data` (or `0:join:1` for sub-steps)

type NotebookStepDef = Pick<NotebookStep, "type" | "clauseType" | "revert"> & {
  valid: (query: Query, stageIndex: number, metadata: Metadata) => boolean;
  active: (query: Query, stageIndex: number, index?: number) => boolean;
  subSteps?: (query: Lib.Query, stageIndex: number) => number;
};

const STEPS: NotebookStepDef[] = [
  {
    type: "data",
    clauseType: "data",
    valid: (_query, stageIndex) => stageIndex === 0,
    active: () => true,
    revert: null, // this step is non-reversible (i.e. non-removable)
  },
  {
    type: "join",
    clauseType: "joins",
    valid: (query, _stageIndex, metadata) => {
      const database = metadata.database(Lib.databaseID(query));
      return hasData(query) && Boolean(database?.hasFeature("join"));
    },
    subSteps: (query, stageIndex) => {
      return Lib.joins(query, stageIndex).length;
    },
    active: (query, stageIndex, index) => {
      if (typeof index !== "number") {
        return false;
      }

      return Lib.joins(query, stageIndex).length > index;
    },
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
    clauseType: "expressions",
    valid: (query, _stageIndex, metadata) => {
      const database = metadata.database(Lib.databaseID(query));
      return hasData(query) && Boolean(database?.hasFeature("expressions"));
    },
    active: (query, stageIndex) => {
      return Lib.expressions(query, stageIndex).length > 0;
    },
    revert: (query, stageIndex) => {
      return Lib.expressions(query, stageIndex).reduce((query, expression) => {
        return Lib.removeClause(query, stageIndex, expression);
      }, query);
    },
  },
  {
    type: "filter",
    clauseType: "filters",
    valid: query => {
      return hasData(query);
    },
    active: (query, stageIndex) => {
      return Lib.filters(query, stageIndex).length > 0;
    },
    revert: (query, stageIndex) => {
      return Lib.filters(query, stageIndex).reduce((query, filter) => {
        return Lib.removeClause(query, stageIndex, filter);
      }, query);
    },
  },
  {
    // NOTE: summarize is a combination of aggregate and breakout
    type: "summarize",
    clauseType: "aggregation",
    valid: query => {
      return hasData(query);
    },
    active: (query, stageIndex) => {
      const hasAggregations = Lib.aggregations(query, stageIndex).length > 0;
      const hasBreakouts = Lib.breakouts(query, stageIndex).length > 0;

      return hasAggregations || hasBreakouts;
    },
    revert: (query, stageIndex) => {
      const clauses = [
        ...Lib.breakouts(query, stageIndex),
        ...Lib.aggregations(query, stageIndex),
      ];

      return clauses.reduce((query, clause) => {
        return Lib.removeClause(query, stageIndex, clause);
      }, query);
    },
  },
  {
    type: "sort",
    clauseType: "order-by",
    valid: (query, stageIndex) => {
      const hasAggregations = Lib.aggregations(query, stageIndex).length > 0;
      const hasBreakouts = Lib.breakouts(query, stageIndex).length > 0;

      if (hasAggregations && !hasBreakouts) {
        return false;
      }

      return (
        hasData(query) &&
        (stageIndex === 0 || Lib.hasClauses(query, stageIndex))
      );
    },
    active: (query, stageIndex) => {
      return Lib.orderBys(query, stageIndex).length > 0;
    },
    revert: (query, stageIndex) => {
      return Lib.removeOrderBys(query, stageIndex);
    },
  },
  {
    type: "limit",
    clauseType: "limit",
    valid: (query, stageIndex) => {
      const hasAggregations = Lib.aggregations(query, stageIndex).length > 0;
      const hasBreakouts = Lib.breakouts(query, stageIndex).length > 0;

      if (hasAggregations && !hasBreakouts) {
        return false;
      }

      return (
        hasData(query) &&
        (stageIndex === 0 || Lib.hasClauses(query, stageIndex))
      );
    },
    active: (query, stageIndex) => {
      return Lib.hasLimit(query, stageIndex);
    },
    revert: (query, stageIndex) => {
      return Lib.limit(query, stageIndex, null);
    },
  },
];

const hasData = (query: Lib.Query): boolean => {
  const databaseId = Lib.databaseID(query);
  return databaseId !== null;
};

/**
 * Returns an array of "steps" to be displayed in the notebook for one "stage" (nesting) of a query
 */
export function getQuestionSteps(
  question: Question,
  metadata: Metadata,
  openSteps: OpenSteps,
) {
  const allSteps: NotebookStep[] = [];

  let query = question.query();

  // strip empty source queries
  query = Lib.dropEmptyStages(query);

  const database = metadata.database(Lib.databaseID(query));
  const allowsNesting = Boolean(database?.hasFeature("nested-queries"));
  const hasBreakouts = Lib.breakouts(query, -1).length > 0;

  // add a level of nesting, if valid
  if (allowsNesting && hasBreakouts) {
    query = Lib.appendStage(query);
  }

  for (let stageIndex = 0; stageIndex < Lib.stageCount(query); ++stageIndex) {
    const { steps, actions } = getStageSteps(
      question,
      query,
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
  question: Question,
  query: Query,
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
    const active = STEP.active(query, stageIndex, itemIndex ?? undefined);
    const step: NotebookStep = {
      id,
      type: STEP.type,
      clauseType: STEP.clauseType,
      stageIndex,
      itemIndex,
      question,
      query,
      valid: STEP.valid(query, stageIndex, metadata),
      active,
      visible:
        STEP.valid(query, stageIndex, metadata) &&
        Boolean(active || openSteps[id]),
      testID: getTestId(STEP, itemIndex),
      revert: STEP.revert
        ? (query: Lib.Query) => {
            const revert = checkNotNull(STEP.revert);
            return revert(query, stageIndex, itemIndex ?? undefined);
          }
        : null,
      // `actions`, `next` and `previous` will be set later
      actions: [],
      next: null,
      previous: null,
    };
    return step;
  }

  // get the currently visible steps, flattening "items"
  const steps = STEPS.flatMap(STEP => {
    if (STEP.subSteps) {
      // add 1 for the initial or next action button
      const itemIndexes = _.range(0, STEP.subSteps(query, stageIndex) + 1);
      return itemIndexes.map(itemIndex => getStep(STEP, itemIndex));
    }

    return [getStep(STEP)];
  });

  let actions = [];
  // iterate over steps in reverse so we can revert query for previewing and accumulate valid actions
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i];
    if (step.visible) {
      // only include previewQuery if the section would be visible (i.e. excluding "openSteps")
      if (step.active) {
        step.previewQuery = Lib.previewQuery(
          query,
          stageIndex,
          step.clauseType,
          step.itemIndex,
        );
      }

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
  }

  return { steps, actions };
}
