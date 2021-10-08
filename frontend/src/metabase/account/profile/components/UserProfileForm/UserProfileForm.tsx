import React, { useCallback } from "react";
import PropTypes from "prop-types";
import User from "metabase/entities/users";

const propTypes = {
  user: PropTypes.object.isRequired,
};

type Props = PropTypes.InferProps<typeof propTypes>;

const UserProfileForm: React.FC<Props> = ({ user }) => {
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
