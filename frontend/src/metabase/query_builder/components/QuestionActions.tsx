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

import { PLUGIN_MODERATION } from "metabase/plugins";

import {
  QuestionActionsContainer,
  PopoverContainer,
} from "./QuestionActions.styled";

import { MODAL_TYPES } from "metabase/query_builder/constants";

const ICON_SIZE = 18;

interface Props {
  isBookmarked: boolean;
  handleBookmark: () => void;
  onOpenModal: (modalType: string) => void;
  question: any;
}

const QuestionActions = ({
  isBookmarked,
  handleBookmark,
  onOpenModal,
  question,
}: Props) => {
  const bookmarkButtonColor = isBookmarked ? color("brand") : "";
  const bookmarkTooltip = isBookmarked ? t`Remove from bookmarks` : t`Bookmark`;

  return (
    <QuestionActionsContainer>
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
              {/* <Button icon="verified" iconSize={ICON_SIZE} borderless>Verify this question</Button> */}
              <PLUGIN_MODERATION.QuestionModerationButton
                question={question}
                VerifyButton={Button}
                verifyButtonProps={{
                  iconSize: ICON_SIZE,
                  borderless: true,
                }}
              />
            </div>
            <div>
              <Button
                icon="dashboard"
                iconSize={ICON_SIZE}
                borderless
                onClick={() => onOpenModal(MODAL_TYPES.ADD_TO_DASHBOARD)}
              >
                Add to dashboard
              </Button>
            </div>
            <div>
              <Button
                icon="move"
                iconSize={ICON_SIZE}
                borderless
                onClick={() => onOpenModal(MODAL_TYPES.MOVE)}
              >
                Move
              </Button>
            </div>
            <div>
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
              >
                Turn into a model
              </Button>
            </div>
            <div>
              <Button
                icon="segment"
                iconSize={ICON_SIZE}
                borderless
                onClick={() => onOpenModal(MODAL_TYPES.CLONE)}
              >
                Duplicate
              </Button>
            </div>
            <div>
              <Button
                icon="archive"
                iconSize={ICON_SIZE}
                borderless
                onClick={() => onOpenModal(MODAL_TYPES.ARCHIVE)}
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
