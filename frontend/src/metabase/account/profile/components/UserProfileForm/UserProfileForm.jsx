import React, { useCallback } from "react";
import PropTypes from "prop-types";

import User from "metabase/entities/users";
import { usePrevious } from "metabase/hooks/use-previous";

const propTypes = {
  user: PropTypes.object,
};

const UserProfileForm = ({ user }) => {
  const previousUser = usePrevious(user);
  const handleSaved = useCallback(() => {
    if (previousUser.locale !== user.locale) {
      window.location.reload();
    }
  }, [previousUser?.locale, user?.locale]);

  return (
    <User.Form user={user} form={User.forms.user(user)} onSaved={handleSaved} />
  );
};

UserProfileForm.propTypes = propTypes;

export default UserProfileForm;
