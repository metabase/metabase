import React from "react";

import NotebookStep from "./NotebookStep";

import _ from "underscore";
import cx from "classnames";

export default class NotebookSteps extends React.Component {
  constructor(props) {
    super(props);
    const isNew = !props.question.table();
    this.state = {
      openSteps: isNew
        ? {
            "0:filter": true,
            // "0:aggregate": true,
            "0:summarize": true,
          }
        : {},
      lastOpenedStep: null,
    };
  }

  handleOpenStep = id => {
    this.setState({
      openSteps: { ...this.state.openSteps, [id]: true },
      lastOpenedStep: id,
    });
  };

  render() {
    const { question, className } = this.props;
    const { openSteps, lastOpenedStep } = this.state;

    if (!question) {
      return null;
    }

    const steps = getQuestionSteps(question, openSteps);

    return (
      <div className={cx(className, "wrapper pt2")}>
        {steps.map((step, index) => (
          <NotebookStep
            key={step.id}
            step={step}
            query={question.query()}
            openStep={this.handleOpenStep}
            isLastStep={index === steps.length - 1}
            isLastOpened={lastOpenedStep === step.id}
          />
        ))}
      </div>
    );
  }
}

import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";

const NEST_STEP_TYPES = ["join", "filter"];

function getQuestionSteps(question, openSteps) {
  const steps = [];

  const query = question.query();
  if (query instanceof StructuredQuery) {
    for (const [stageIndex, stageQuery] of query.queries().entries()) {
      const stageSteps = getStageSteps(stageQuery, stageIndex, openSteps);
      steps.push(...stageSteps);
    }

    const last = steps[steps.length - 1];
    if (
      last.type === "breakout" ||
      last.type === "sort" ||
      last.type === "limit"
    ) {
      for (const type of NEST_STEP_TYPES) {
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

  return steps;
}

const STEPS = [
  {
    type: "data",
    valid: query => !query.sourceQuery(),
    visible: query => true,
    revert: query => query,
  },
  {
    type: "join",
    valid: query => !!query.table(),
    visible: query => query.joins().length > 0,
    revert: query => query.clearJoins(),
  },
  {
    type: "expression",
    valid: query => !!query.table(),
    visible: query => Object.keys(query.expressions()).length > 0,
    revert: query => query.clearExpressions(),
  },
  {
    type: "filter",
    valid: query => !!query.table(),
    visible: query => query.filters().length > 0,
    revert: query => query.clearFilters(),
  },
  // {
  //   type: "aggregate",
  //   valid: query => !!query.table(),
  //   visible: query => query.aggregations().length > 0,
  //   revert: query => query.clearAggregations(),
  // },
  // {
  //   type: "breakout",
  //   valid: query => !!query.table() && query.aggregations().length > 0,
  //   visible: query => query.breakouts().length > 0,
  //   revert: query => query.clearBreakouts(),
  // },
  {
    type: "summarize",
    valid: query => !!query.table(),
    visible: query =>
      query.aggregations().length > 0 || query.breakouts().length > 0,
    revert: query => query.clearBreakouts().clearAggregations(),
  },
  {
    type: "sort",
    valid: query =>
      !!query.table() &&
      (query.aggregations().length === 0 || query.breakouts().length > 0),
    visible: query => query.sorts().length > 0,
    revert: query => query.clearSort(),
  },
  {
    type: "limit",
    valid: query => !!query.table(),
    visible: query => query.limit() != null,
    revert: query => query.clearLimit(),
  },
];

function getStageSteps(query, stageIndex, openSteps) {
  const getId = step => `${stageIndex}:${step.type}`;

  // get the currently visible steps
  const steps = STEPS.filter(
    STEP =>
      STEP.valid(query) && (STEP.visible(query) || openSteps[getId(STEP)]),
  ).map(STEP => ({
    stage: stageIndex,
    type: STEP.type,
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
      // only include previewQuery if the section would be visible (i.e. excluding "defaults")
      step.previewQuery = STEP.visible(query) ? previewQuery : null;
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
    previewQuery = STEP.revert(previewQuery);
  }

  return steps;
}
