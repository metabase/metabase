import { useCallback, useMemo } from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";

import SettingHeader from "metabase/admin/settings/components/SettingHeader";
import GroupMappingsWidget from "metabase/admin/settings/containers/GroupMappingsWidget";
import { updateSettings } from "metabase/admin/settings/settings";
import type { SettingElement } from "metabase/admin/settings/types";
import Breadcrumbs from "metabase/components/Breadcrumbs";
import CS from "metabase/css/core/index.css";
import {
  FormSection,
  Form,
  FormErrorMessage,
  FormProvider,
  FormSecretKey,
  FormSubmitButton,
  FormSwitch,
  FormTextInput,
} from "metabase/forms";
import { rem, Flex, Stack } from "metabase/ui";
import type { SettingValue } from "metabase-types/api";

type SettingValues = { [key: string]: SettingValue };

type JWTFormSettingElement = Omit<SettingElement, "key"> & {
  key: string; // ensuring key is required
  is_env_setting?: boolean;
  env_name?: string;
  default?: any;
};

type Props = {
  elements: JWTFormSettingElement[];
  settingValues: SettingValues;
  onSubmit: (values: SettingValues) => void;
};

export const SettingsJWTForm = ({
  elements = [],
  settingValues,
  onSubmit,
}: Props) => {
  const isEnabled = settingValues["jwt-enabled"];

  const settings = useMemo(() => {
    return _.indexBy(elements, "key");
  }, [elements]);

  const fields = useMemo(() => {
    return _.mapObject(settings, setting => ({
      name: setting.key,
      label: setting.display_name,
      description: setting.description,
      placeholder: setting.is_env_setting
        ? t`Using ${setting.env_name}`
        : setting.placeholder || setting.default,
      default: setting.default,
      required: setting.required,
      autoFocus: setting.autoFocus,
      onChanged: setting.onChanged,
    }));
  }, [settings]);

  const attributeValues = useMemo(() => {
    return getAttributeValues(settings, settingValues);
  }, [settings, settingValues]);

  const handleSubmit = useCallback(
    (values: SettingValues) => {
      return onSubmit({ ...values, "jwt-enabled": true });
    },
    [onSubmit],
  );

  return (
    <FormProvider
      initialValues={attributeValues}
      onSubmit={handleSubmit}
      enableReinitialize
    >
      {({ dirty }) => (
        <Form m={"0 1rem"} maw={rem(520)}>
          <Breadcrumbs
            className={CS.mb3}
            crumbs={[
              [t`Authentication`, "/admin/settings/authentication"],
              [t`JWT`],
            ]}
          />
          <Stack spacing={rem(12)} m={`${rem(40)} 0`}>
            <SettingHeader
              id="jwt-user-provisioning-enabled?"
              setting={settings["jwt-user-provisioning-enabled?"]}
            />
            <FormSwitch
              id="jwt-user-provisioning-enabled?"
              name={fields["jwt-user-provisioning-enabled?"].name}
            />
          </Stack>
          <FormSection title={"Server Settings"}>
            <Stack spacing="md">
              <FormTextInput {...fields["jwt-identity-provider-uri"]} />
              <FormSecretKey
                {...fields["jwt-shared-secret"]}
                confirmation={{
                  header: t`Regenerate JWT signing key?`,
                  dialog: t`This will cause existing tokens to stop working until the identity provider is updated with the new key.`,
                }}
              />
            </Stack>
          </FormSection>
          <FormSection
            title={"User attribute configuration (optional)"}
            collapsible
          >
            <Stack spacing="md">
              <FormTextInput {...fields["jwt-attribute-email"]} />
              <FormTextInput {...fields["jwt-attribute-firstname"]} />
              <FormTextInput {...fields["jwt-attribute-lastname"]} />
            </Stack>
          </FormSection>
          <FormSection title={"Group Schema"} data-testid="jwt-group-schema">
            <GroupMappingsWidget
              isFormik
              setting={{ key: "jwt-group-sync" }}
              onChange={handleSubmit}
              settingValues={settingValues}
              mappingSetting="jwt-group-mappings"
              groupHeading={t`Group Name`}
              groupPlaceholder={t`Group Name`}
            />
          </FormSection>
          <Flex direction={"column"} align={"start"} gap={"1rem"}>
            <FormErrorMessage />
            <FormSubmitButton
              disabled={!dirty}
              label={isEnabled ? t`Save changes` : t`Save and enable`}
              variant="filled"
            />
          </Flex>
        </Form>
      )}
    </FormProvider>
  );
};

const JWT_ATTRS = [
  "jwt-user-provisioning-enabled?",
  "jwt-identity-provider-uri",
  "jwt-shared-secret",
  "jwt-attribute-email",
  "jwt-attribute-firstname",
  "jwt-attribute-lastname",
  "jwt-group-sync",
];

const DEFAULTABLE_JWT_ATTRS = new Set(["jwt-user-provisioning-enabled?"]);

const getAttributeValues = (
  settings: Record<string, JWTFormSettingElement>,
  values: SettingValues,
) => {
  return Object.fromEntries(
    JWT_ATTRS.map(key => [
      key,
      DEFAULTABLE_JWT_ATTRS.has(key)
        ? values[key] ?? settings[key]?.default
        : values[key],
    ]),
  );
};

const mapDispatchToProps = {
  onSubmit: updateSettings,
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(null, mapDispatchToProps)(SettingsJWTForm);
