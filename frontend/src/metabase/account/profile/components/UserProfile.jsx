import React, { useCallback } from "react";
import PropTypes from "prop-types";
import User from "metabase/entities/users";

const propTypes = {
  user: PropTypes.object,
  updateUser: PropTypes.func,
};

const UserProfile = ({ user, updateUser }) => {
  const handleSaved = useCallback(
    ({ locale }) => {
      if (locale !== user.locale) {
        window.location.reload();
      }
    },
    [user],
  );

  return (
    <User.Form
      user={user}
      form={User.forms.user}
      updateUser={updateUser}
      onSaved={handleSaved}
    />
  );
};

UserProfile.propTypes = propTypes;

export default UserProfile;
