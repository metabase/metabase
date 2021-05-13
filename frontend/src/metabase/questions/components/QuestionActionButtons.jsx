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
    <div className="flex align-center">
      <div className="my1 pr2">
        {canWrite && (
          <Tooltip tooltip={t`Edit details`}>
            <Button
              className="mr1"
              onlyIcon
              icon="pencil"
              iconSize={18}
              onClick={() => onOpenModal("edit")}
            />
          </Tooltip>
        )}
        <Tooltip tooltip={t`Add to dashboard`}>
          <Button
            onlyIcon
            icon="add_to_dash"
            iconSize={18}
            onClick={() => onOpenModal("add-to-dashboard")}
          />
        </Tooltip>
      </div>
      <div className="border-left pl2">
        {canWrite && (
          <Tooltip tooltip={t`Move`}>
            <Button
              className="mr1 text-light"
              onlyIcon
              icon="move"
              iconSize={18}
              onClick={() => onOpenModal("move")}
            />
          </Tooltip>
        )}
        {canWrite && (
          <Tooltip tooltip={t`Duplicate this question`}>
            <Button
              className="mr1 text-light"
              onlyIcon
              icon="segment"
              iconSize={18}
              onClick={() => onOpenModal("clone")}
            />
          </Tooltip>
        )}
        {canWrite && (
          <Tooltip tooltip={t`Archive`}>
            <Button
              className="text-light"
              onlyIcon
              icon="archive"
              iconSize={18}
              onClick={() => onOpenModal("archive")}
            />
          </Tooltip>
        )}
      </div>
    </div>
  );
}

QuestionActionButtons.propTypes = {
  canWrite: PropTypes.bool,
  onOpenModal: PropTypes.func,
};

export default QuestionActionButtons;
