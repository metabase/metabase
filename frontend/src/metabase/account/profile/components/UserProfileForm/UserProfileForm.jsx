import React, { useCallback } from "react";
import PropTypes from "prop-types";
import User from "metabase/entities/users";

const propTypes = {
  user: PropTypes.object,
};

const UserProfileForm = ({ user }) => {
  const handleSaved = useCallback(
    ({ locale }) => {
      if (locale !== user.locale) {
        window.location.reload();
      }
    },
    [user],
  );

  return <User.Form user={user} form={User.forms.user} onSaved={handleSaved} />;
};

UserProfileForm.propTypes = propTypes;

export default UserProfileForm;
