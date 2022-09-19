import React, { useState } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import { connect } from "react-redux";
import { updateLdapSettings } from "metabase/admin/settings/settings";
import SettingsBatchForm from "./SettingsBatchForm";
import { FormButton } from "./SettingsLdapForm.styled";

const DEFAULT_BUTTON_STATES = {
  default: t`Save changes`,
  working: t`Saving...`,
  success: t`Changes saved!`,
};

const PRIMARY_BUTTON_STATES = {
  ...DEFAULT_BUTTON_STATES,
  default: t`Save and enable`,
};

const SECONDARY_BUTTON_STATES = {
  ...DEFAULT_BUTTON_STATES,
  default: t`Save but don't enable`,
};

const propTypes = {
  settingValues: PropTypes.object.isRequired,
  updateLdapSettings: PropTypes.func.isRequired,
};

const SettingsLdapForm = ({ settingValues, updateLdapSettings, ...props }) => {
  const isEnabled = settingValues["ldap-enabled"];
  const [isAutoEnabled, setIsAutoEnabled] = useState(false);
  const breadcrumbs = getBreadcrumbs();
  const layout = getLayout(settingValues);

  const handleSubmit = (settings, { isAutoEnabled }) => {
    setIsAutoEnabled(isAutoEnabled);
    return updateLdapSettings({ ...settings, "ldap-enabled": isAutoEnabled });
  };

  return (
    <SettingsBatchForm
      {...props}
      breadcrumbs={breadcrumbs}
      layout={layout}
      updateSettings={handleSubmit}
      renderSubmitButton={({ disabled, submitting, pristine, onSubmit }) => (
        <FormButton
          primary={!disabled}
          success={submitting === "success"}
          disabled={disabled || pristine}
          onClick={event => onSubmit(event, { isAutoEnabled: true })}
        >
          {getPrimaryButtonText(submitting, isEnabled, isAutoEnabled)}
        </FormButton>
      )}
      renderExtraButtons={
        !isEnabled &&
        (({ disabled, submitting, pristine, onSubmit }) => (
          <FormButton
            success={submitting === "success"}
            disabled={disabled || pristine}
            onClick={event => onSubmit(event, { isAutoEnabled: false })}
          >
            {getSecondaryButtonText(submitting, isAutoEnabled)}
          </FormButton>
        ))
      }
    />
  );
};

SettingsLdapForm.propTypes = propTypes;

const getBreadcrumbs = () => {
  return [[t`Authentication`, "/admin/settings/authentication"], [t`LDAP`]];
};

const getLayout = settingValues => {
  return [
    {
      title: t`Server Settings`,
      settings: [
        "ldap-host",
        "ldap-port",
        "ldap-security",
        "ldap-bind-dn",
        "ldap-password",
      ],
    },
    {
      title: t`User Schema`,
      settings: ["ldap-user-base", "ldap-user-filter"],
    },
    {
      title: t`Attributes`,
      collapse: true,
      settings: [
        "ldap-attribute-email",
        "ldap-attribute-firstname",
        "ldap-attribute-lastname",
      ],
    },
    {
      title: t`Group Schema`,
      settings: [
        "ldap-group-sync",
        "ldap-group-base",
        "ldap-group-membership-filter" in settingValues
          ? "ldap-group-membership-filter"
          : null,
        "ldap-sync-admin-group" in settingValues
          ? "ldap-sync-admin-group"
          : null,
      ].filter(Boolean),
    },
  ];
};

const getPrimaryButtonText = (state, isEnabled, isAutoEnabled) => {
  if (isEnabled) {
    return DEFAULT_BUTTON_STATES[state];
  } else if (isAutoEnabled) {
    return PRIMARY_BUTTON_STATES[state];
  } else {
    return PRIMARY_BUTTON_STATES.default;
  }
};

const getSecondaryButtonText = (state, isAutoEnabled) => {
  if (!isAutoEnabled) {
    return SECONDARY_BUTTON_STATES[state];
  } else {
    return SECONDARY_BUTTON_STATES.default;
  }
};

const mapDispatchToProps = { updateLdapSettings };

export default connect(null, mapDispatchToProps)(SettingsLdapForm);
