import React, { useCallback } from "react";
import PropTypes from "prop-types";

import User from "metabase/entities/users";

const propTypes = {
  user: PropTypes.object,
};

const UserProfileForm = ({ user }) => {
  const handleSaved = useCallback(
    values => {
      if (user.locale !== values.locale) {
        window.location.reload();
      }
    },
    [user?.locale],
  );

  return (
    <User.Form
      user={user}
      form={User.forms.user(user)}
      onSaved={handleSaved}
      overwriteOnInitialValuesChange
    />
  );
};

UserProfileForm.propTypes = propTypes;

export default UserProfileForm;
