import React from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { t } from "ttag";
import { updateSettings } from "metabase/admin/settings/settings";
import SettingsBatchForm from "metabase/admin/settings/components/SettingsBatchForm";
import { FormButton } from "./SettingsJWTForm.styled";

const propTypes = {
  settingValues: PropTypes.object.isRequired,
  updateSettings: PropTypes.func.isRequired,
};

const SettingsJWTForm = ({ settingValues, updateSettings, ...props }) => {
  const isEnabled = settingValues["jwt-enabled"];

  const handleAutoEnableSubmit = formData => {
    return updateSettings({ ...formData, "jwt-enabled": true });
  };

  return (
    <SettingsBatchForm
      {...props}
      layout={FORM_LAYOUT}
      breadcrumbs={BREADCRUMBS}
      settingValues={settingValues}
      updateSettings={updateSettings}
      renderSubmitButton={
        !isEnabled &&
        (({ disabled, pristine, onSubmit }) => (
          <FormButton
            primary={!disabled}
            disabled={disabled || pristine}
            actionFn={() => onSubmit(handleAutoEnableSubmit)}
            normalText={t`Save and enable`}
            successText={t`Changes saved!`}
          />
        ))
      }
      renderExtraButtons={
        !isEnabled &&
        (({ disabled, pristine, onSubmit }) => (
          <FormButton
            disabled={disabled || pristine}
            actionFn={() => onSubmit(updateSettings)}
            normalText={t`Save but don't enable`}
            successText={t`Changes saved!`}
          />
        ))
      }
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
  updateSettings,
};

export default connect(null, mapDispatchToProps)(SettingsJWTForm);
