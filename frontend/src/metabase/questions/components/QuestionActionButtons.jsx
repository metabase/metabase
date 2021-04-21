import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import styled from "styled-components";

import { color } from "metabase/lib/colors";

import Button from "metabase/components/Button";

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
        <Button
          tooltip={t`Duplicate this question`}
          onlyIcon
          icon="clone"
          iconSize={18}
          onClick={() => onOpenModal("clone")}
        />
      )}
      {canWrite && (
        <Button
          tooltip={t`Move`}
          onlyIcon
          icon="move"
          iconSize={18}
          onClick={() => onOpenModal("move")}
        />
      )}
      {canWrite && (
        <Button
          tooltip={t`Archive`}
          onlyIcon
          icon="archive"
          iconSize={18}
          onClick={() => onOpenModal("archive")}
        />
      )}
    </div>
  );
}

QuestionActionButtons.propTypes = {
  canWrite: PropTypes.bool,
  onOpenModal: PropTypes.func,
};

export default QuestionActionButtons;
