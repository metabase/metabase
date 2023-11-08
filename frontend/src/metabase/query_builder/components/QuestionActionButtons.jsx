import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import { MODAL_TYPES } from "metabase/query_builder/constants";

import Button from "metabase/components/Button";
import Tooltip from "metabase/components/Tooltip";
import { Container } from "./QuestionActionButtons.styled";

export const EDIT_TESTID = "edit-details-button";
export const ADD_TO_DASH_TESTID = "add-to-dashboard-button";
export const MOVE_TESTID = "move-button";
export const CLONE_TESTID = "clone-button";
export const ARCHIVE_TESTID = "archive-button";

const ICON_SIZE = 18;

QuestionActionButtons.propTypes = {
  canWrite: PropTypes.bool.isRequired,
  onOpenModal: PropTypes.func.isRequired,
};

export default QuestionActionButtons;

function QuestionActionButtons({ canWrite, onOpenModal }) {
  return (
    <Container>
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
      <Tooltip tooltip={t`Add to dashboard`}>
        <Button
          onlyIcon
          icon="add_to_dash"
          iconSize={ICON_SIZE}
          onClick={() => onOpenModal(MODAL_TYPES.ADD_TO_DASHBOARD)}
          data-testid={ADD_TO_DASH_TESTID}
        />
      </Tooltip>
      {canWrite && (
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
      {canWrite && (
        <Tooltip tooltip={t`Duplicate this question`}>
          <Button
            onlyIcon
            icon="segment"
            iconSize={ICON_SIZE}
            onClick={() => onOpenModal(MODAL_TYPES.CLONE)}
            data-testid={CLONE_TESTID}
          />
        </Tooltip>
      )}
      {canWrite && (
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
    </Container>
  );
}
