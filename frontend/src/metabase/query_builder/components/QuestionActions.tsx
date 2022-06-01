import React, { useCallback } from "react";
import { t } from "ttag";

import Button from "metabase/core/components/Button";
import Tooltip from "metabase/components/Tooltip";
import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";

import DatasetMetadataStrengthIndicator from "./view/sidebars/DatasetManagementSection/DatasetMetadataStrengthIndicator/DatasetMetadataStrengthIndicator";

import { PLUGIN_MODERATION } from "metabase/plugins";

import { MODAL_TYPES } from "metabase/query_builder/constants";

import { color } from "metabase/lib/colors";
import { checkCanBeModel } from "metabase/lib/data-modeling/utils";

import Question from "metabase-lib/lib/Question";

import {
  QuestionActionsContainer,
  PopoverContainer,
} from "./QuestionActions.styled";

const ICON_SIZE = 18;

const ADD_TO_DASH_TESTID = "add-to-dashboard-button";
const MOVE_TESTID = "move-button";
const TURN_INTO_DATASET_TESTID = "turn-into-dataset";
const TOGGLE_MODEL_PERSISTENCE_TESTID = "toggle-persistence";
const CLONE_TESTID = "clone-button";
const ARCHIVE_TESTID = "archive-button";

interface Props {
  isBookmarked: boolean;
  handleBookmark: () => void;
  onOpenModal: (modalType: string) => void;
  question: Question;
  setQueryBuilderMode: (
    mode: string,
    opt: { datasetEditorTab: string },
  ) => void;
  turnDatasetIntoQuestion: () => void;
}

const buttonProps = {
  iconSize: ICON_SIZE,
  borderless: true,
  color: color("text-dark"),
  fullWidth: true,
  justifyContent: "start",
};

const QuestionActions = ({
  isBookmarked,
  handleBookmark,
  onOpenModal,
  question,
  setQueryBuilderMode,
  turnDatasetIntoQuestion,
}: Props) => {
  const bookmarkButtonColor = isBookmarked ? color("brand") : "";
  const bookmarkTooltip = isBookmarked ? t`Remove from bookmarks` : t`Bookmark`;

  const isDataset = question.isDataset();
  const canWrite = question.canWrite();

  const handleEditQuery = useCallback(() => {
    setQueryBuilderMode("dataset", {
      datasetEditorTab: "query",
    });
  }, [setQueryBuilderMode]);

  const handleEditMetadata = useCallback(() => {
    setQueryBuilderMode("dataset", {
      datasetEditorTab: "metadata",
    });
  }, [setQueryBuilderMode]);

  return (
    <QuestionActionsContainer data-testid="question-action-buttons-container">
      <Tooltip tooltip={bookmarkTooltip}>
        <Button
          onlyIcon
          icon="bookmark"
          iconSize={ICON_SIZE}
          onClick={handleBookmark}
          color={bookmarkButtonColor}
        />
      </Tooltip>

      <TippyPopoverWithTrigger
        key="extra-actions-menu"
        placement="bottom-end"
        renderTrigger={({ onClick }) => (
          <Button
            onClick={onClick}
            onlyIcon
            icon="ellipsis"
            iconSize={ICON_SIZE}
          />
        )}
        popoverContent={
          <PopoverContainer>
            <div>
              <PLUGIN_MODERATION.QuestionModerationButton
                question={question}
                VerifyButton={Button}
                verifyButtonProps={buttonProps}
              />
            </div>
            {isDataset && (
              <div>
                <Button
                  icon="notebook"
                  iconSize={ICON_SIZE}
                  borderless
                  onClick={handleEditQuery}
                  data-testid={ADD_TO_DASH_TESTID}
                  color={color("text-dark")}
                  fullWidth
                  justifyContent="start"
                >
                  {t`Edit query definition`}
                  <DatasetMetadataStrengthIndicator dataset={question} />
                </Button>
              </div>
            )}
            {isDataset && (
              <div>
                <Button
                  icon="label"
                  iconSize={ICON_SIZE}
                  borderless
                  onClick={handleEditMetadata}
                  data-testid={ADD_TO_DASH_TESTID}
                  color={color("text-dark")}
                  fullWidth
                  justifyContent="start"
                >
                  {t`Edit metadata`}
                </Button>
              </div>
            )}
            {!isDataset && (
              <div>
                <Button
                  icon="dashboard"
                  onClick={() => onOpenModal(MODAL_TYPES.ADD_TO_DASHBOARD)}
                  data-testid={ADD_TO_DASH_TESTID}
                  {...buttonProps}
                >
                  {t`Add to dashboard`}
                </Button>
              </div>
            )}
            {canWrite && (
              <div>
                <Button
                  icon="move"
                  onClick={() => onOpenModal(MODAL_TYPES.MOVE)}
                  data-testid={MOVE_TESTID}
                  {...buttonProps}
                >
                  {t`Move`}
                </Button>
              </div>
            )}
            {!isDataset && canWrite && (
              <div>
                <Button
                  icon="model"
                  onClick={() => {
                    const modal = checkCanBeModel(question)
                      ? MODAL_TYPES.TURN_INTO_DATASET
                      : MODAL_TYPES.CAN_NOT_CREATE_MODEL;
                    onOpenModal(modal);
                  }}
                  data-testid={TURN_INTO_DATASET_TESTID}
                  {...buttonProps}
                >
                  {t`Turn into a model`}
                </Button>
              </div>
            )}
            {isDataset && canWrite && (
              <div>
                <Button
                  icon="model_framed"
                  onClick={turnDatasetIntoQuestion}
                  data-testid=""
                  {...buttonProps}
                >
                  {t`Turn back to saved question`}
                </Button>
              </div>
            )}
            {canWrite && (
              <div>
                <Button
                  icon="segment"
                  onClick={() => onOpenModal(MODAL_TYPES.CLONE)}
                  data-testid={CLONE_TESTID}
                  {...buttonProps}
                >
                  {t`Duplicate`}
                </Button>
              </div>
            )}
            {canWrite && (
              <div>
                <Button
                  icon="archive"
                  onClick={() => onOpenModal(MODAL_TYPES.ARCHIVE)}
                  data-testid={ARCHIVE_TESTID}
                  {...buttonProps}
                >
                  {t`Archive`}
                </Button>
              </div>
            )}
          </PopoverContainer>
        }
      />
    </QuestionActionsContainer>
  );
};

export default QuestionActions;
