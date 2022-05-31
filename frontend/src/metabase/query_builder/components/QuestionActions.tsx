import React from "react";
import { t } from "ttag";

import { color } from "metabase/lib/colors";

import Button from "metabase/core/components/Button";
import Tooltip from "metabase/components/Tooltip";

import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";

import {
  checkDatabaseSupportsModels,
  checkCanBeModel,
  checkDatabaseCanPersistDatasets,
} from "metabase/lib/data-modeling/utils";

import DatasetMetadataStrengthIndicator from "./view/sidebars/DatasetManagementSection/DatasetMetadataStrengthIndicator/DatasetMetadataStrengthIndicator";

import { PLUGIN_MODERATION } from "metabase/plugins";

import {
  QuestionActionsContainer,
  PopoverContainer,
} from "./QuestionActions.styled";

import { MODAL_TYPES } from "metabase/query_builder/constants";

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
  question: any;
  setQueryBuilderMode: (mode: string, opt: {datasetEditorTab: string}) => void;
  turnDatasetIntoQuestion: () => void;
}

const QuestionActions = ({
  isBookmarked,
  handleBookmark,
  onOpenModal,
  question,
  setQueryBuilderMode,
  turnDatasetIntoQuestion
}: Props) => {
  const bookmarkButtonColor = isBookmarked ? color("brand") : "";
  const bookmarkTooltip = isBookmarked ? t`Remove from bookmarks` : t`Bookmark`;

  const isDataset = question.isDataset();
  const canWrite = question.canWrite();

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
                verifyButtonProps={{
                  iconSize: ICON_SIZE,
                  borderless: true,
                }}
              />
            </div>
            {isDataset && <div>
              <Button
                icon="notebook"
                iconSize={ICON_SIZE}
                borderless
                onClick={() => {
                  setQueryBuilderMode("dataset", {
                    datasetEditorTab: "query",
                  });
                }}
                data-testid={ADD_TO_DASH_TESTID}
              >
                Edit query definition <DatasetMetadataStrengthIndicator dataset={question} textOnly/>
              </Button>
            </div>}
            {isDataset && <div>
              <Button
                icon="label"
                iconSize={ICON_SIZE}
                borderless
                onClick={() => {
                  setQueryBuilderMode("dataset", {
                    datasetEditorTab: "metadata",
                  });
                }}
                data-testid={ADD_TO_DASH_TESTID}
              >
                Edit metadata
              </Button>
            </div>}
            {!isDataset && <div>
              <Button
                icon="dashboard"
                iconSize={ICON_SIZE}
                borderless
                onClick={() => onOpenModal(MODAL_TYPES.ADD_TO_DASHBOARD)}
                data-testid={ADD_TO_DASH_TESTID}
              >
                Add to dashboard
              </Button>
            </div>}
            <div>
              <Button
                icon="move"
                iconSize={ICON_SIZE}
                borderless
                onClick={() => onOpenModal(MODAL_TYPES.MOVE)}
                data-testid={MOVE_TESTID}
              >
                Move
              </Button>
            </div>
            <div>
              <Button
                icon="segment"
                iconSize={ICON_SIZE}
                borderless
                onClick={() => onOpenModal(MODAL_TYPES.CLONE)}
                data-testid={CLONE_TESTID}
              >
                Duplicate
              </Button>
            </div>
            {!isDataset && <div>
              <Button
                icon="model"
                iconSize={ICON_SIZE}
                borderless
                onClick={() => {
                  const modal = checkCanBeModel(question)
                    ? MODAL_TYPES.TURN_INTO_DATASET
                    : MODAL_TYPES.CAN_NOT_CREATE_MODEL;
                  onOpenModal(modal);
                }}
                data-testid={TURN_INTO_DATASET_TESTID}
              >
                Turn into a model
              </Button>
            </div>}
            {isDataset && <div>
              <Button
                icon="model_framed"
                iconSize={ICON_SIZE}
                borderless
                onClick={turnDatasetIntoQuestion}
                data-testid=""
              >
                Turn back to saved question
              </Button>
            </div>}
            <div>
              <Button
                icon="archive"
                iconSize={ICON_SIZE}
                borderless
                onClick={() => onOpenModal(MODAL_TYPES.ARCHIVE)}
                data-testid={ARCHIVE_TESTID}
              >
                Archive
              </Button>
            </div>
          </PopoverContainer>
        }
      />
    </QuestionActionsContainer>
  );
};

export default QuestionActions;
