import React, { useCallback, useMemo } from "react";
import PropTypes from "prop-types";

import User from "metabase/entities/users";
import { SettingsApi } from "metabase/services";
import { refreshCurrentUser } from "metabase/redux/user";
import { t } from "ttag";
import Toggle from "metabase/core/components/Toggle";

const propTypes = {
  user: PropTypes.object,
  dispatch: PropTypes.func,
};

const UserProfileForm = ({ user, dispatch }) => {
  const handleSaved = useCallback(
    values => {
      if (user.locale !== values.locale) {
        window.location.reload();
      }
    },
    [user?.locale],
  );

  const onChangeAnimations = useCallback(
    async value => {
      await SettingsApi.put({
        key: "enable-animations",
        value: value,
      });
      dispatch(refreshCurrentUser());
    },
    [dispatch],
  );

  const animationField = useMemo(() => {
    return {
      value: user?.settings?.["enable-animations"] !== "false",
      onChange: onChangeAnimations,
    };
  }, [user, onChangeAnimations]);

  return (
    <>
      <User.Form
        user={user}
        form={User.forms.user(user)}
        onSaved={handleSaved}
        overwriteOnInitialValuesChange
      />
      <div className="flex-column align-center pt1 mt2">
        <span className="Form-label">Interface animations</span>
        <div className="flex align-center pt1">
          <Toggle
            onChange={animationField.onChange}
            value={animationField.value}
          />
          <span className="text-bold mx1">
            {animationField.value ? t`Enabled` : t`Disabled`}
          </span>
        </div>
      </div>
    </>
  );
};

UserProfileForm.propTypes = propTypes;

export default UserProfileForm;
