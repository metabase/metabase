import React from "react";
import cx from "classnames";

import type Question from "metabase-lib/Question";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";

import { getQuestionSteps } from "./lib/steps";
import NotebookStep from "./NotebookStep";

interface NotebookStepsProps {
  className?: string;
  question: Question;
  sourceQuestion?: Question;
  reportTimezone?: string;
  updateQuestion: (question: Question) => void;
}

interface State {
  openSteps: { [key: string]: boolean };
  lastOpenedStep: string | null;
}

class NotebookSteps extends React.Component<NotebookStepsProps, State> {
  constructor(props: NotebookStepsProps) {
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

  openStep = (id: string) => {
    this.setState({
      openSteps: { ...this.state.openSteps, [id]: true },
      lastOpenedStep: id,
    });
  };

  closeStep = (id: string) => {
    this.setState({
      openSteps: { ...this.state.openSteps, [id]: false },
      lastOpenedStep:
        this.state.lastOpenedStep === id ? null : this.state.lastOpenedStep,
    });
  };

  render() {
    const {
      question,
      className,
      reportTimezone,
      sourceQuestion,
      updateQuestion,
    } = this.props;
    const { openSteps, lastOpenedStep } = this.state;

    if (!question) {
      return null;
    }

    const steps = getQuestionSteps(question, openSteps);

    return (
      <div className={cx(className, "pt3")}>
        {steps.map((step, index) => {
          // pass a version of updateQuery that cleans subsequent steps etc
          const updateQuery = async (query: StructuredQuery) => {
            const datasetQuery = query.datasetQuery();
            const updatedQuery = step.update(datasetQuery);
            await updateQuestion(updatedQuery.question());
            // mark the step as "closed" since we can assume it's been added or removed by the updateQuery
            this.closeStep(step.id);
          };
          return (
            <NotebookStep
              key={step.id}
              step={step}
              sourceQuestion={sourceQuestion}
              updateQuery={updateQuery}
              openStep={this.openStep}
              closeStep={this.closeStep}
              isLastStep={index === steps.length - 1}
              isLastOpened={lastOpenedStep === step.id}
              reportTimezone={reportTimezone}
            />
          );
        })}
      </div>
    );
  }
}

export default NotebookSteps;
