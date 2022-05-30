import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import { connect } from "react-redux";

import { checkDatabaseCanPersistDatasets } from "metabase/lib/data-modeling/utils";
import { onModelPersistenceChange } from "metabase/query_builder/actions";
import { MODAL_TYPES } from "metabase/query_builder/constants";
import { getNestedQueriesEnabled } from "metabase/selectors/settings";

import { PLUGIN_MODEL_PERSISTENCE } from "metabase/plugins";
import Button from "metabase/core/components/Button";
import Tooltip from "metabase/components/Tooltip";

import { Container } from "./QuestionActionButtons.styled";

export const EDIT_TESTID = "edit-details-button";
// export const ADD_TO_DASH_TESTID = "add-to-dashboard-button";
// export const MOVE_TESTID = "move-button";
// export const TURN_INTO_DATASET_TESTID = "turn-into-dataset";
export const TOGGLE_MODEL_PERSISTENCE_TESTID = "toggle-persistence";
// export const CLONE_TESTID = "clone-button";
// export const ARCHIVE_TESTID = "archive-button";

const ICON_SIZE = 18;

QuestionActionButtons.propTypes = {
  question: PropTypes.object.isRequired,
  canWrite: PropTypes.bool.isRequired,
  areNestedQueriesEnabled: PropTypes.bool.isRequired,
  onOpenModal: PropTypes.func.isRequired,
  isBookmarked: PropTypes.bool.isRequired,
  toggleBookmark: PropTypes.func.isRequired,
  onModelPersistenceChange: PropTypes.func.isRequired,
};

function mapStateToProps(state) {
  return {
    areNestedQueriesEnabled: getNestedQueriesEnabled(state),
  };
}

const mapDispatchToProps = {
  onModelPersistenceChange,
};

function QuestionActionButtons({
  question,
  canWrite,
  // areNestedQueriesEnabled,
  onOpenModal,
  // isBookmarked,
  // toggleBookmark,
  onModelPersistenceChange,
}) {
  const isSaved = question.isSaved();
  const isDataset = question.isDataset();
  const canPersistDataset =
    PLUGIN_MODEL_PERSISTENCE.isModelLevelPersistenceEnabled() &&
    canWrite &&
    isSaved &&
    isDataset &&
    checkDatabaseCanPersistDatasets(question.query().database());
  return (
    <Container data-testid="question-action-buttons">
      {canWrite && (
        <Tooltip tooltip={t`Edit details`}>
          <Button
            onlyIcon
            icon="pencil"
            iconSize={ICON_SIZE}
            onClick={() => onOpenModal(MODAL_TYPES.EDIT)}
            data-testid={EDIT_TESTID}
          />
        </Tooltip>
      )}
      {/* <Tooltip tooltip={t`Add to dashboard`}>
        <Button
          onlyIcon
          icon="add_to_dash"
          iconSize={ICON_SIZE}
          onClick={() => onOpenModal(MODAL_TYPES.ADD_TO_DASHBOARD)}
          data-testid={ADD_TO_DASH_TESTID}
        />
      </Tooltip> */}
      {/* {canWrite && (
        <Tooltip tooltip={t`Move`}>
          <Button
            onlyIcon
            icon="move"
            iconSize={ICON_SIZE}
            onClick={() => onOpenModal(MODAL_TYPES.MOVE)}
            data-testid={MOVE_TESTID}
          />
        </Tooltip>
      )}
      {canTurnIntoModel && (
        <Tooltip tooltip={t`Turn this into a model`}>
          <Button
            onlyIcon
            icon="model"
            iconSize={ICON_SIZE}
            onClick={() => {
              const modal = checkCanBeModel(question)
                ? MODAL_TYPES.TURN_INTO_DATASET
                : MODAL_TYPES.CAN_NOT_CREATE_MODEL;
              onOpenModal(modal);
            }}
            data-testid={TURN_INTO_DATASET_TESTID}
          />
        </Tooltip>
      )}*/}
      {canPersistDataset && (
        <PLUGIN_MODEL_PERSISTENCE.ModelCacheControl
          model={question}
          size={ICON_SIZE}
          onChange={onModelPersistenceChange}
          data-testid={TOGGLE_MODEL_PERSISTENCE_TESTID}
        />
      )}
      {/* {canWrite && (
        <Tooltip tooltip={duplicateTooltip}>
          <Button
            onlyIcon
            icon="segment"
            iconSize={ICON_SIZE}
            onClick={() => onOpenModal(MODAL_TYPES.CLONE)}
            data-testid={CLONE_TESTID}
          />
        </Tooltip>
      )} */}
      {/* {canWrite && (
        <Tooltip tooltip={t`Archive`}>
          <Button
            onlyIcon
            icon="archive"
            iconSize={ICON_SIZE}
            onClick={() => onOpenModal(MODAL_TYPES.ARCHIVE)}
            data-testid={ARCHIVE_TESTID}
          />
        </Tooltip>
      )}
      <Tooltip tooltip={bookmarkTooltip}>
        <BookmarkButton
          onlyIcon
          animation={animation}
          icon="bookmark"
          iconSize={ICON_SIZE}
          isBookmarked={isBookmarked}
          onClick={handleClickBookmark}
          color={bookmarkButtonColor}
        />
      </Tooltip> */}
    </Container>
  );
}

export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(QuestionActionButtons);
