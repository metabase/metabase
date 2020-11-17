import React from "react";

import NotebookStep from "./NotebookStep";

import cx from "classnames";
import { getQuestionSteps } from "./lib/steps";

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

  openStep = id => {
    this.setState({
      openSteps: { ...this.state.openSteps, [id]: true },
      lastOpenedStep: id,
    });
  };

  closeStep = id => {
    this.setState({
      openSteps: { ...this.state.openSteps, [id]: false },
      lastOpenedStep:
        this.state.lastOpenedStep === id ? null : this.state.lastOpenedStep,
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
      <div className={cx(className, "pt3")}>
        {steps.map((step, index) => {
          // pass a version of updateQuery that cleans subsequent steps etc
          const updateQuery = async datasetQuery => {
            await step.update(datasetQuery).update();
            // mark the step as "closed" since we can assume it's been added or removed by the updateQuery
            this.closeStep(step.id);
          };
          return (
            <NotebookStep
              key={step.id}
              step={step}
              updateQuery={updateQuery}
              openStep={this.openStep}
              closeStep={this.closeStep}
              isLastStep={index === steps.length - 1}
              isLastOpened={lastOpenedStep === step.id}
            />
          );
        })}
      </div>
    );
  }
}
