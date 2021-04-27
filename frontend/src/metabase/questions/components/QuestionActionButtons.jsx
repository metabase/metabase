import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import styled from "styled-components";

import { color } from "metabase/lib/colors";

import Button from "metabase/components/Button";
import Tooltip from "metabase/components/Tooltip";

const BlueHoverTextButton = styled(Button)`
  :hover {
    color: ${color("brand")};
  }
`;

function QuestionActionButtons({ canWrite, onOpenModal }) {
  return (
    <div className="my1 flex justify-between align-center">
      <BlueHoverTextButton
        className="flex-1"
        icon="add_to_dash"
        borderless
        iconSize={18}
        onClick={() => onOpenModal("add-to-dashboard")}
      >
        Add to a dashboard
      </BlueHoverTextButton>
      {canWrite && (
        <Tooltip tooltip={t`Edit this question`}>
          <Button
            onlyIcon
            icon="edit_document"
            iconSize={18}
            onClick={() => onOpenModal("edit")}
          />
        </Tooltip>
      )}
      {canWrite && (
        <Tooltip tooltip={t`Duplicate this question`}>
          <Button
            onlyIcon
            icon="clone"
            iconSize={18}
            onClick={() => onOpenModal("clone")}
          />
        </Tooltip>
      )}
      {canWrite && (
        <Tooltip tooltip={t`Move`}>
          <Button
            onlyIcon
            icon="move"
            iconSize={18}
            onClick={() => onOpenModal("move")}
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
          />
        </Tooltip>
      )}
    </div>
  );
}

QuestionActionButtons.propTypes = {
  canWrite: PropTypes.bool,
  onOpenModal: PropTypes.func,
};

export default QuestionActionButtons;
