import React, { useCallback, useState } from "react";
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
  PopoverButton,
  BookmarkButton,
  AnimationStates,
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
};

const QuestionActions = ({
  isBookmarked,
  handleBookmark,
  onOpenModal,
  question,
  setQueryBuilderMode,
  turnDatasetIntoQuestion,
}: Props) => {
  const [animation, setAnimation] = useState<AnimationStates>(null);

  const handleClickBookmark = () => {
    handleBookmark();
    setAnimation(isBookmarked ? "shrink" : "expand");
  };
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

  const handleTurnToModel = useCallback(() => {
    const modal = checkCanBeModel(question)
      ? MODAL_TYPES.TURN_INTO_DATASET
      : MODAL_TYPES.CAN_NOT_CREATE_MODEL;
    onOpenModal(modal);
  }, [onOpenModal, question]);

  return (
    <QuestionActionsContainer data-testid="question-action-buttons-container">
      <Tooltip tooltip={bookmarkTooltip}>
        <BookmarkButton
          animation={animation}
          isBookmarked={isBookmarked}
          onlyIcon
          icon="bookmark"
          iconSize={ICON_SIZE}
          onClick={handleClickBookmark}
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
                VerifyButton={PopoverButton}
                verifyButtonProps={buttonProps}
              />
            </div>
            {isDataset && (
              <div>
                <PopoverButton
                  icon="notebook"
                  onClick={handleEditQuery}
                  data-testid={ADD_TO_DASH_TESTID}
                  {...buttonProps}
                >
                  {t`Edit query definition`}
                </PopoverButton>
              </div>
            )}
            {isDataset && (
              <div>
                <PopoverButton
                  icon="label"
                  onClick={handleEditMetadata}
                  data-testid={ADD_TO_DASH_TESTID}
                  {...buttonProps}
                >
                  {t`Edit metadata`}
                  <DatasetMetadataStrengthIndicator dataset={question} />
                </PopoverButton>
              </div>
            )}
            {!isDataset && (
              <div>
                <PopoverButton
                  icon="dashboard"
                  onClick={() => onOpenModal(MODAL_TYPES.ADD_TO_DASHBOARD)}
                  data-testid={ADD_TO_DASH_TESTID}
                  {...buttonProps}
                >
                  {t`Add to dashboard`}
                </PopoverButton>
              </div>
            )}
            {canWrite && (
              <div>
                <PopoverButton
                  icon="move"
                  onClick={() => onOpenModal(MODAL_TYPES.MOVE)}
                  data-testid={MOVE_TESTID}
                  {...buttonProps}
                >
                  {t`Move`}
                </PopoverButton>
              </div>
            )}
            {!isDataset && canWrite && (
              <div>
                <PopoverButton
                  icon="model"
                  onClick={handleTurnToModel}
                  data-testid={TURN_INTO_DATASET_TESTID}
                  {...buttonProps}
                >
                  {t`Turn into a model`}
                </PopoverButton>
              </div>
            )}
            {isDataset && canWrite && (
              <div>
                <PopoverButton
                  icon="model_framed"
                  onClick={turnDatasetIntoQuestion}
                  data-testid=""
                  {...buttonProps}
                >
                  {t`Turn back to saved question`}
                </PopoverButton>
              </div>
            )}
            {canWrite && (
              <div>
                <PopoverButton
                  icon="segment"
                  onClick={() => onOpenModal(MODAL_TYPES.CLONE)}
                  data-testid={CLONE_TESTID}
                  {...buttonProps}
                >
                  {t`Duplicate`}
                </PopoverButton>
              </div>
            )}
            {canWrite && (
              <div>
                <PopoverButton
                  icon="archive"
                  onClick={() => onOpenModal(MODAL_TYPES.ARCHIVE)}
                  data-testid={ARCHIVE_TESTID}
                  {...buttonProps}
                >
                  {t`Archive`}
                </PopoverButton>
              </div>
            )}
          </PopoverContainer>
        }
      />
    </QuestionActionsContainer>
  );
};

export default QuestionActions;
