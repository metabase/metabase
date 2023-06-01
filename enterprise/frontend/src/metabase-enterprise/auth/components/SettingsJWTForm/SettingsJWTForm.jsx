import { useCallback } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { t } from "ttag";
import { updateSettings } from "metabase/admin/settings/settings";
import SettingsBatchForm from "metabase/admin/settings/components/SettingsBatchForm";
import { FormButton } from "./SettingsJWTForm.styled";

const propTypes = {
  settingValues: PropTypes.object.isRequired,
  onSubmit: PropTypes.func.isRequired,
};

const SettingsJWTForm = ({ settingValues, onSubmit, ...props }) => {
  const isEnabled = settingValues["jwt-enabled"];

  const handleSubmit = useCallback(
    values => {
      return onSubmit({ ...values, "jwt-enabled": true });
    },
    [onSubmit],
  );

  return (
    <SettingsBatchForm
      {...props}
      layout={FORM_LAYOUT}
      breadcrumbs={BREADCRUMBS}
      settingValues={settingValues}
      updateSettings={handleSubmit}
      renderSubmitButton={({ disabled, pristine, onSubmit }) => (
        <FormButton
          primary={!disabled}
          disabled={disabled || pristine}
          actionFn={onSubmit}
          normalText={isEnabled ? t`Save changes` : t`Save and enable`}
          successText={t`Success`}
        />
      )}
    />
  );
};

SettingsJWTForm.propTypes = propTypes;

const FORM_LAYOUT = [
  {
    title: t`Server Settings`,
    settings: ["jwt-identity-provider-uri", "jwt-shared-secret"],
  },
  {
    title: t`User attribute configuration (optional)`,
    collapse: true,
    settings: [
      "jwt-attribute-email",
      "jwt-attribute-firstname",
      "jwt-attribute-lastname",
    ],
  },
  {
    title: t`Group Schema`,
    settings: ["jwt-group-sync"],
  },
];

const BREADCRUMBS = [
  [t`Authentication`, "/admin/settings/authentication"],
  [t`JWT`],
];

const mapDispatchToProps = {
  onSubmit: updateSettings,
};

export default connect(null, mapDispatchToProps)(SettingsJWTForm);
