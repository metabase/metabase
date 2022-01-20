import React, { useCallback } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import User from "metabase/entities/users";

const propTypes = {
  user: PropTypes.object,
  validatePassword: PropTypes.func,
  updatePassword: PropTypes.func,
};

const UserPasswordForm = ({ user, validatePassword, updatePassword }) => {
  const handleAsyncValidate = useCallback(
    async ({ password }) => {
      try {
        validatePassword(password);
        return {};
      } catch (error) {
        return error.data.errors;
      }
    },
    [validatePassword],
  );

  const handleSubmit = useCallback(
    ({ password, old_password }) => {
      updatePassword(user.id, password, old_password);
    },
    [user, updatePassword],
  );

  return (
    <User.Form
      form={User.forms.password}
      submitTitle={t`Save`}
      asyncValidate={handleAsyncValidate}
      asyncBlurFields={["password"]}
      onSubmit={handleSubmit}
    />
  );
};

UserPasswordForm.propTypes = propTypes;

export default UserPasswordForm;
