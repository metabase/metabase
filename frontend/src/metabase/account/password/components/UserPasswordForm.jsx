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
    values => {
      try {
        validatePassword(values.password);
        return {};
      } catch (error) {
        return error.data.errors;
      }
    },
    [validatePassword],
  );

  const handleSubmit = useCallback(
    values => {
      updatePassword({ user_id: user.id, ...values });
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
