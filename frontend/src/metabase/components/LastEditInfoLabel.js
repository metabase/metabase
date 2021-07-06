import React from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import styled from "styled-components";
import { t } from "ttag";
import moment from "moment";

import { color } from "metabase/lib/colors";

import { getUser } from "metabase/selectors/user";

const Label = styled.span`
  font-weight: bold;
  color: ${color("text-medium")};
`;

function mapStateToProps(state) {
  return {
    user: getUser(state),
  };
}

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
  user: PropTypes.shape({
    id: PropTypes.number,
  }).isRequired,
};

function formatEditorName(firstName, lastName) {
  const lastNameFirstLetter = lastName.charAt(0);
  return `${firstName} ${lastNameFirstLetter}.`;
}

function LastEditInfoLabel({ item, user, ...props }) {
  const { first_name, last_name, id: editorId, timestamp } = item[
    "last-edit-info"
  ];
  const time = moment(timestamp).fromNow();

  const editor =
    editorId === user.id ? "you" : formatEditorName(first_name, last_name);

  return <Label {...props}>{t`Edited ${time} by ${editor}`}</Label>;
}

export default connect(mapStateToProps)(LastEditInfoLabel);
