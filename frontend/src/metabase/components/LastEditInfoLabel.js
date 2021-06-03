import React from "react";
import PropTypes from "prop-types";
import styled from "styled-components";
import { t } from "ttag";
import moment from "moment";

import { color } from "metabase/lib/colors";

const Label = styled.span`
  font-weight: bold;
  color: ${color("text-medium")};
`;

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
};

function LastEditInfoLabel({ item, ...props }) {
  const { first_name, last_name, timestamp } = item["last-edit-info"];
  const time = moment(timestamp).fromNow();
  const lastNameFirstLetter = last_name.charAt(0);
  const editor = `${first_name} ${lastNameFirstLetter}.`;
  return <Label {...props}>{t`Edited ${time} by ${editor}`}</Label>;
}

export default LastEditInfoLabel;
