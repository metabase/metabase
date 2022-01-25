import React from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { t } from "ttag";
import moment from "moment";

import { getUser } from "metabase/selectors/user";

function mapStateToProps(state) {
  return {
    user: getUser(state),
  };
}

LastEditInfo.propTypes = {
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

function LastEditInfo({ item, user }) {
  const { first_name, last_name, id: editorId, timestamp } = item[
    "last-edit-info"
  ];
  const time = moment(timestamp).fromNow();

  const editor =
    editorId === user.id ? t`you` : formatEditorName(first_name, last_name);

  return <>{t`Edited ${time} by ${editor}`}</>;
}

export default connect(mapStateToProps)(LastEditInfo);
