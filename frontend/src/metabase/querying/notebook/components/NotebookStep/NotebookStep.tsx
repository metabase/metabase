import cx from "classnames";
import { useCallback, useMemo } from "react";
import { t } from "ttag";

import ExpandingContent from "metabase/components/ExpandingContent";
import CS from "metabase/css/core/index.css";
import { useToggle } from "metabase/hooks/use-toggle";
import { color as c } from "metabase/lib/colors";
import { Box, Flex } from "metabase/ui";
import type { Query } from "metabase-lib";

import type {
  NotebookStep as INotebookStep,
  NotebookStepAction,
} from "../../types";

import { NotebookActionButton } from "./NotebookActionButton";
import S from "./NotebookStep.module.css";
import { NotebookStepPreview } from "./NotebookStepPreview";
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
  updateQuery: (query: Query) => Promise<void>;
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

  const actionButtons = useMemo(() => {
    const actions = [];
    const hasLargeActionButtons =
      isLastStep && step.actions.some(hasLargeButton);

    actions.push(
      ...step.actions.map(action => {
        const stepUi = getStepConfig(action.type);
        const title = stepUi.title;
        return {
          priority: stepUi.priority,
          button: (
            <NotebookActionButton
              key={`actionButton_${title}`}
              className={cx({
                [cx(CS.mr2, CS.mt2)]: isLastStep,
                [CS.mr1]: !isLastStep,
              })}
              large={hasLargeActionButtons}
              {...stepUi}
              title={title}
              aria-label={title}
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

  const { title, color, Step, StepHeader } = getStepConfig(step.type);

  const canPreview = step.previewQuery != null;
  const hasPreviewButton = !isPreviewOpen && canPreview;
  const canRevert = step.revert != null && !readOnly;

  return (
    <ExpandingContent isInitiallyOpen={!isLastOpened} isOpen>
      <Box
        className={cx(CS.hoverParent, CS.hoverVisibility, S.StepRoot)}
        data-testid={step.testID}
      >
        <Box w={`${(11 / 12) * 100}%`} maw="75rem">
          <StepHeader
            step={step}
            title={title}
            color={color}
            canRevert={canRevert}
            onRevert={handleClickRevert}
          />
        </Box>

        <Flex align="center">
          <Box w={`${(11 / 12) * 100}%`} maw="75rem">
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
          </Box>
          {!readOnly && (
            <Box w={`${(1 / 12) * 100}%`}>
              <Box
                className={cx(S.PreviewButton, {
                  [S.noPreviewButton]: !hasPreviewButton,
                })}
                component={NotebookActionButton}
                icon="play"
                title={t`Preview`}
                color={c("text-light")}
                transparent
                onClick={openPreview}
                data-testid="step-preview-button"
              />
            </Box>
          )}
        </Flex>

        {canPreview && isPreviewOpen && (
          <NotebookStepPreview step={step} onClose={closePreview} />
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
