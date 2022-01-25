import React from "react";
import PropTypes from "prop-types";

import { TextButton } from "metabase/components/Button.styled";

import LastEditInfo from "./LastEditInfo";

LastEditInfoLabel.propTypes = {
  item: PropTypes.shape({
    "last-edit-info": PropTypes.shape({
      id: PropTypes.number.isRequired,
      email: PropTypes.string.isRequired,
      first_name: PropTypes.string.isRequired,
      last_name: PropTypes.string.isRequired,
      timestamp: PropTypes.string.isRequired,
    }).isRequired,
  }),
  onClick: PropTypes.func,
  className: PropTypes.string,
};

function LastEditInfoLabel({ item, onClick, className }) {
  return (
    <TextButton
      size="small"
      className={className}
      onClick={onClick}
      data-testid="revision-history-button"
    >
      <LastEditInfo item={item} />
    </TextButton>
  );
}

export default LastEditInfoLabel;
