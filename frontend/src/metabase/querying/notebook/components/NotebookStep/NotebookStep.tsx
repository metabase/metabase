import cx from "classnames";
import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { ExpandingContent } from "metabase/common/components/ExpandingContent";
import { useToggle } from "metabase/common/hooks/use-toggle";
import CS from "metabase/css/core/index.css";
import { Box } from "metabase/ui";
import type * as Lib from "metabase-lib";

import type {
  NotebookStep as INotebookStep,
  NotebookStepAction,
} from "../../types";

import { NotebookActionButton } from "./NotebookActionButton";
import S from "./NotebookStep.module.css";
import { NotebookStepPreview } from "./NotebookStepPreview";
import {
  StepPreviewContext,
  type StepPreviewControls,
} from "./StepPreviewContext";
import { getStepConfig } from "./utils";

function hasLargeButton(action: NotebookStepAction) {
  return !getStepConfig(action.type).compact;
}

interface NotebookStepProps {
  step: INotebookStep;
  isLastStep: boolean;
  isLastOpened: boolean;
  reportTimezone: string;
  readOnly?: boolean;
  openStep: (id: string) => void;
  updateQuery: (query: Lib.Query) => Promise<void>;
}

export function NotebookStep({
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
  // An inline editor's Run opens the preview and keeps it on the query as it
  // changes, until the code is edited again.
  const [previewRunId, setPreviewRunId] = useState(0);
  const [isPreviewLive, setIsPreviewLive] = useState(false);
  const previewControls = useMemo<StepPreviewControls>(
    () => ({
      run: () => {
        openPreview();
        setPreviewRunId((id) => id + 1);
      },
      setIsLive: setIsPreviewLive,
    }),
    [openPreview],
  );

  const actionButtons = useMemo(() => {
    const actions = [];
    const hasLargeActionButtons =
      isLastStep && step.actions.some(hasLargeButton);

    actions.push(
      ...step.actions.map((action) => {
        const stepUi = getStepConfig(action.type);
        const title = stepUi.title;
        return {
          priority: stepUi.priority,
          button: (
            <NotebookActionButton
              key={`actionButton_${title}`}
              className={cx({
                [cx(CS.mr2, CS.mt2)]: isLastStep && hasLargeActionButtons,
                [CS.mr1]: !isLastStep || (isLastStep && !hasLargeActionButtons),
              })}
              large={hasLargeActionButtons}
              icon={stepUi.icon}
              color={stepUi.color}
              secondary={stepUi.secondary}
              title={title}
              aria-label={title}
              onClick={() => action.action({ openStep })}
            />
          ),
        };
      }),
    );

    actions.sort((a, b) => (b.priority || 0) - (a.priority || 0));

    return actions.map((action) => action.button);
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

  const { title, color, Step, StepHeader } = getStepConfig(step.type);

  const canPreview = step.previewQuery != null && !readOnly;
  const hasPreviewButton = !isPreviewOpen && canPreview;
  const canRevert = step.revert != null && !readOnly;

  return (
    <ExpandingContent isInitiallyOpen={!isLastOpened} isOpen>
      <Box className={S.StepRoot} data-testid={step.testID}>
        <Box w={`${(11 / 12) * 100}%`} maw="75rem">
          <StepHeader
            step={step}
            title={title}
            color={color}
            canRevert={canRevert}
            onRevert={handleClickRevert}
          />
        </Box>

        {/* A grid, so that the preview button stays next to the step's cell
            when an inline editor opens below it. */}
        <div className={S.StepBody}>
          <div className={S.StepContent}>
            <StepPreviewContext.Provider value={previewControls}>
              <Step
                step={step}
                query={step.query}
                stageIndex={step.stageIndex}
                color={color}
                updateQuery={updateQuery}
                isLastOpened={isLastOpened}
                reportTimezone={reportTimezone}
                readOnly={readOnly}
              />
            </StepPreviewContext.Provider>
          </div>
          {!readOnly && (
            <Box className={S.StepActions}>
              <Box
                className={cx(S.PreviewButton, {
                  [S.noPreviewButton]: !hasPreviewButton,
                })}
                component={NotebookActionButton}
                icon="play"
                title={t`Preview`}
                color={"text-disabled"}
                onClick={openPreview}
                data-testid="step-preview-button"
              />
            </Box>
          )}
        </div>

        {canPreview && isPreviewOpen && (
          <NotebookStepPreview
            step={step}
            runId={previewRunId}
            isLive={isPreviewLive}
            onClose={closePreview}
          />
        )}

        {actionButtons.length > 0 && !readOnly && (
          <Box mt="sm" data-testid="action-buttons">
            {actionButtons}
          </Box>
        )}
      </Box>
    </ExpandingContent>
  );
}
