import React from "react";
import { t } from "ttag";

import { color as c } from "metabase/lib/colors";

import Icon from "metabase/components/Icon";
import ExpandingContent from "metabase/components/ExpandingContent";

import type Question from "metabase-lib/Question";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";

import { NotebookStep as INotebookStep } from "../lib/steps.types";
import NotebookStepPreview from "../NotebookStepPreview";

import { STEP_UI } from "./steps";
import ActionButton from "./ActionButton";
import {
  StepActionsContainer,
  StepBody,
  StepContent,
  StepHeader,
  StepButtonContainer,
  StepRoot,
} from "./NotebookStep.styled";

function getTestId(step: INotebookStep) {
  const { type, stageIndex, itemIndex } = step;
  return `step-${type}-${stageIndex || 0}-${itemIndex || 0}`;
}

interface NotebookStepProps {
  step: INotebookStep;
  sourceQuestion?: Question;
  isLastStep: boolean;
  isLastOpened: boolean;
  reportTimezone?: string;
  openStep: (id: string) => void;
  updateQuery: (query: StructuredQuery) => Promise<void>;
}

class NotebookStep extends React.Component<NotebookStepProps> {
  state = {
    showPreview: false,
  };

  getActionButtons = (largeActionButtons: boolean) => {
    const { step, isLastStep, openStep } = this.props;

    const actions = [];

    actions.push(
      ...step.actions.map(action => {
        const stepUi = STEP_UI[action.type];

        return {
          priority: stepUi.priority,
          button: (
            <ActionButton
              mr={isLastStep ? 2 : 1}
              mt={isLastStep ? 2 : undefined}
              color={stepUi.getColor()}
              large={largeActionButtons}
              {...stepUi}
              key={`actionButton_${stepUi.title}`}
              onClick={() => action.action({ query: step.query, openStep })}
            />
          ),
        };
      }),
    );

    actions.sort((a, b) => (b.priority || 0) - (a.priority || 0));

    return actions.map(action => action.button);
  };

  handleShowPreview = () => {
    this.setState({ showPreview: true });
  };

  handleClosePreview = () => {
    this.setState({ showPreview: false });
  };

  handleClickRevert = () => {
    const { step, updateQuery } = this.props;
    const reverted = step.revert?.(step.query);
    if (reverted) {
      updateQuery(reverted);
    }
  };

  render() {
    const {
      step,
      sourceQuestion,
      isLastStep,
      isLastOpened,
      reportTimezone,
      updateQuery,
    } = this.props;
    const { showPreview } = this.state;

    const {
      title,
      getColor,
      component: NotebookStepComponent,
    } = STEP_UI[step.type] || {};

    const color = getColor();
    const canPreview = step?.previewQuery?.isValid?.();
    const showPreviewButton = !showPreview && canPreview;

    const largeActionButtons =
      isLastStep && step.actions.some(action => !STEP_UI[action.type].compact);

    const actionButtons = this.getActionButtons(largeActionButtons);

    return (
      <ExpandingContent isInitiallyOpen={!isLastOpened} isOpen>
        <StepRoot
          className="hover-parent hover--visibility"
          data-testid={getTestId(step)}
        >
          <StepHeader color={color}>
            {title}
            <Icon
              name="close"
              className="ml-auto cursor-pointer text-light text-medium-hover hover-child"
              tooltip={t`Remove`}
              onClick={this.handleClickRevert}
              data-testid="remove-step"
            />
          </StepHeader>

          {NotebookStepComponent && (
            <StepBody>
              <StepContent>
                <NotebookStepComponent
                  color={color}
                  step={step}
                  query={step.query}
                  sourceQuestion={sourceQuestion}
                  updateQuery={updateQuery}
                  isLastOpened={isLastOpened}
                  reportTimezone={reportTimezone}
                />
              </StepContent>
              <StepButtonContainer>
                <ActionButton
                  ml={[1, 2]}
                  className={
                    !showPreviewButton ? "hidden disabled" : "text-brand-hover"
                  }
                  icon="play"
                  title={t`Preview`}
                  color={c("text-light")}
                  transparent
                  onClick={this.handleShowPreview}
                />
              </StepButtonContainer>
            </StepBody>
          )}

          {showPreview && canPreview && (
            <NotebookStepPreview
              step={step}
              onClose={this.handleClosePreview}
            />
          )}

          {actionButtons.length > 0 && (
            <StepActionsContainer data-testid="action-buttons">
              {actionButtons}
            </StepActionsContainer>
          )}
        </StepRoot>
      </ExpandingContent>
    );
  }
}

export default NotebookStep;
