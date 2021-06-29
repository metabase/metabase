import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import Button from "metabase/components/Button";
import Tooltip from "metabase/components/Tooltip";
import {
  Container,
  PrimaryButtonContainer,
  SecondaryButtonContainer,
} from "./QuestionActionButtons.styled";

function QuestionActionButtons({ canWrite, onOpenModal }) {
  return (
    <Container>
      <PrimaryButtonContainer>
        {canWrite && (
          <Tooltip tooltip={t`Edit details`}>
            <Button
              onlyIcon
              icon="pencil"
              iconSize={18}
              onClick={() => onOpenModal("edit")}
              data-testid="edit-details-button"
            />
          </Tooltip>
        )}
        <Tooltip tooltip={t`Add to dashboard`}>
          <Button
            onlyIcon
            icon="add_to_dash"
            iconSize={18}
            onClick={() => onOpenModal("add-to-dashboard")}
            data-testid="add-to-dashboard-button"
          />
        </Tooltip>
      </PrimaryButtonContainer>
      <SecondaryButtonContainer>
        {canWrite && (
          <Tooltip tooltip={t`Move`}>
            <Button
              onlyIcon
              icon="move"
              iconSize={18}
              onClick={() => onOpenModal("move")}
              data-testid="move-button"
            />
          </Tooltip>
        )}
        {canWrite && (
          <Tooltip tooltip={t`Duplicate this question`}>
            <Button
              onlyIcon
              icon="segment"
              iconSize={18}
              onClick={() => onOpenModal("clone")}
              data-testid="clone-button"
            />
          </Tooltip>
        )}
        {canWrite && (
          <Tooltip tooltip={t`Archive`}>
            <Button
              onlyIcon
              icon="archive"
              iconSize={18}
              onClick={() => onOpenModal("archive")}
              data-testid="archive-button"
            />
          </Tooltip>
        )}
      </SecondaryButtonContainer>
    </Container>
  );
}

QuestionActionButtons.propTypes = {
  canWrite: PropTypes.bool,
  onOpenModal: PropTypes.func,
};

export default QuestionActionButtons;
