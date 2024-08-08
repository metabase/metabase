import cx from "classnames";
import { useCallback, useMemo } from "react";
import { t } from "ttag";

import ExpandingContent from "metabase/components/ExpandingContent";
import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import CS from "metabase/css/core/index.css";
import { useToggle } from "metabase/hooks/use-toggle";
import { color as c } from "metabase/lib/colors";
import { Icon } from "metabase/ui";
import type { Query } from "metabase-lib";

import NotebookStepPreview from "../NotebookStepPreview";
import type {
  NotebookStep as INotebookStep,
  NotebookStepAction,
} from "../types";

import ActionButton from "./ActionButton";
import {
  PreviewButton,
  StepActionsContainer,
  StepBody,
  StepButtonContainer,
  StepContent,
  StepHeader,
  StepRoot,
} from "./NotebookStep.styled";
import { STEP_UI } from "./steps";

function hasLargeButton(action: NotebookStepAction) {
  return !STEP_UI[action.type].compact;
}

interface NotebookStepProps {
  step: INotebookStep;
  isLastStep: boolean;
  isLastOpened: boolean;
  reportTimezone: string;
  readOnly?: boolean;
  openStep: (id: string) => void;
  updateQuery: (query: Query) => Promise<void>;
}

function NotebookStep({
  step,
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
              className={cx({
                [cx(CS.mr2, CS.mt2)]: isLastStep,
                [CS.mr1]: !isLastStep,
              })}
              color={stepUi.getColor()}
              large={hasLargeActionButtons}
              {...stepUi}
              aria-label={stepUi.title}
              onClick={() => action.action({ openStep })}
            />
          ),
        };
      }),
    );

    actions.sort((a, b) => (b.priority || 0) - (a.priority || 0));

    return actions.map(action => action.button);
  }, [step.actions, isLastStep, openStep]);

  const handleClickRevert = useCallback(() => {
    if (step.revert) {
      const reverted = step.revert(
        step.query,
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
  const canPreview = step.previewQuery != null;
  const hasPreviewButton = !isPreviewOpen && canPreview;
  const canRevert = step.revert != null && !readOnly;

  return (
    <ExpandingContent isInitiallyOpen={!isLastOpened} isOpen>
      <StepRoot
        className={cx(CS.hoverParent, CS.hoverVisibility)}
        data-testid={step.testID}
      >
        <StepHeader color={color}>
          {title}
          {canRevert && (
            <IconButtonWrapper
              className={cx(
                CS.mlAuto,
                CS.textLight,
                CS.textMediumHover,
                CS.hoverChild,
              )}
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
                query={step.query}
                stageIndex={step.stageIndex}
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
                  data-testid="step-preview-button"
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
