import { useCallback, useMemo } from "react";
import { t } from "ttag";
import cx from "classnames";

import { color as c } from "metabase/lib/colors";
import { useToggle } from "metabase/hooks/use-toggle";

import { Icon } from "metabase/core/components/Icon";
import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import ExpandingContent from "metabase/components/ExpandingContent";

import type { Query } from "metabase-lib/types";
import type Question from "metabase-lib/Question";

import type {
  NotebookStep as INotebookStep,
  NotebookStepAction,
} from "../types";
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
  PreviewButton,
} from "./NotebookStep.styled";

function hasLargeButton(action: NotebookStepAction) {
  return !STEP_UI[action.type].compact;
}

interface NotebookStepProps {
  step: INotebookStep;
  sourceQuestion?: Question;
  isLastStep: boolean;
  isLastOpened: boolean;
  reportTimezone: string;
  readOnly?: boolean;
  openStep: (id: string) => void;
  updateQuery: (query: Query) => Promise<void>;
}

function NotebookStep({
  step,
  sourceQuestion,
  isLastStep,
  isLastOpened,
  reportTimezone,
  openStep,
  updateQuery,
  readOnly = false,
}: NotebookStepProps) {
  const [isPreviewOpen, { turnOn: openPreview, turnOff: closePreview }] =
    useToggle(false);

  const actionButtons = useMemo(() => {
    const actions = [];
    const hasLargeActionButtons =
      isLastStep && step.actions.some(hasLargeButton);

    actions.push(
      ...step.actions.map(action => {
        const stepUi = STEP_UI[action.type];
        return {
          priority: stepUi.priority,
          button: (
            <ActionButton
              key={`actionButton_${stepUi.title}`}
              className={cx({ "mr2 mt2": isLastStep, mr1: !isLastStep })}
              color={stepUi.getColor()}
              large={hasLargeActionButtons}
              {...stepUi}
              aria-label={stepUi.title}
              onClick={() => action.action({ query: step.query, openStep })}
            />
          ),
        };
      }),
    );

    actions.sort((a, b) => (b.priority || 0) - (a.priority || 0));

    return actions.map(action => action.button);
  }, [step.query, step.actions, isLastStep, openStep]);

  const handleClickRevert = useCallback(() => {
    if (step.revert) {
      const reverted = step.revert(
        step.topLevelQuery,
        step.stageIndex,
        step.itemIndex ?? undefined,
      );
      updateQuery(reverted);
    }
  }, [step, updateQuery]);

  const {
    title,
    getColor,
    component: NotebookStepComponent,
  } = STEP_UI[step.type] || {};

  const color = getColor();
  const canPreview = Boolean(step.previewQuery);
  const hasPreviewButton = !isPreviewOpen && canPreview;
  const canRevert = typeof step.revert === "function" && !readOnly;

  return (
    <ExpandingContent isInitiallyOpen={!isLastOpened} isOpen>
      <StepRoot
        className="hover-parent hover--visibility"
        data-testid={step.testID}
      >
        <StepHeader color={color}>
          {title}
          {canRevert && (
            <IconButtonWrapper
              className="ml-auto text-light text-medium-hover hover-child"
              onClick={handleClickRevert}
            >
              <Icon
                name="close"
                tooltip={t`Remove`}
                aria-label={t`Remove step`}
              />
            </IconButtonWrapper>
          )}
        </StepHeader>

        {NotebookStepComponent && (
          <StepBody>
            <StepContent>
              <NotebookStepComponent
                color={color}
                step={step}
                topLevelQuery={step.topLevelQuery}
                query={step.query}
                stageIndex={step.stageIndex}
                sourceQuestion={sourceQuestion}
                updateQuery={updateQuery}
                isLastOpened={isLastOpened}
                reportTimezone={reportTimezone}
                readOnly={readOnly}
              />
            </StepContent>
            {!readOnly && (
              <StepButtonContainer>
                <PreviewButton
                  as={ActionButton}
                  icon="play"
                  title={t`Preview`}
                  color={c("text-light")}
                  transparent
                  hasPreviewButton={hasPreviewButton}
                  onClick={openPreview}
                />
              </StepButtonContainer>
            )}
          </StepBody>
        )}

        {canPreview && isPreviewOpen && (
          <NotebookStepPreview step={step} onClose={closePreview} />
        )}

        {actionButtons.length > 0 && !readOnly && (
          <StepActionsContainer data-testid="action-buttons">
            {actionButtons}
          </StepActionsContainer>
        )}
      </StepRoot>
    </ExpandingContent>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default NotebookStep;
