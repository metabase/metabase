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
export const TOGGLE_MODEL_PERSISTENCE_TESTID = "toggle-persistence";

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
  onOpenModal,
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
      {canPersistDataset && (
        <PLUGIN_MODEL_PERSISTENCE.ModelCacheControl
          model={question}
          size={ICON_SIZE}
          onChange={onModelPersistenceChange}
          data-testid={TOGGLE_MODEL_PERSISTENCE_TESTID}
        />
      )}
    </Container>
  );
}

export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(QuestionActionButtons);
