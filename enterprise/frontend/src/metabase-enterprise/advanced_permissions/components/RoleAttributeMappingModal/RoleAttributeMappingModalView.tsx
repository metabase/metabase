import React, { useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";
import Link from "metabase/core/components/Link";
import FormSelect from "metabase/core/components/FormSelect";
import FormProvider from "metabase/core/components/FormProvider";
import FormSubmitButton from "metabase/core/components/FormSubmitButton";
import FormErrorMessage from "metabase/core/components/FormErrorMessage";
import FormInput from "metabase/core/components/FormInput";
import Form from "metabase/core/components/Form";
import MetabaseSettings from "metabase/lib/settings";
import * as Errors from "metabase/core/utils/errors";
import {
  Database,
  RoleAttributeMapping,
  UserAttribute,
} from "metabase-types/api";
import Alert from "metabase/core/components/Alert";
import FormFooter from "metabase/core/components/FormFooter";
import Button from "metabase/core/components/Button";
import * as Urls from "metabase/lib/urls";
import {
  RoleAttributeMappingAlert,
  RoleAttributeMappingDescription,
  RoleAttributeMappingModalViewRoot,
} from "./RoleAttributeMappingModalView.styled";

const ROLE_ATTRIBUTION_MAPPING_SCHEMA = Yup.object({
  attribute: Yup.string().required(Errors.required).default(""),
  default_role: Yup.string().required(Errors.required).default(""),
});

type RoleAttributeMappingModalViewProps = {
  attributes: UserAttribute[];
  database: Database;
  mapping?: RoleAttributeMapping;
  onSave: (mapping: RoleAttributeMapping) => void;
  onCancel: () => void;
};

const RoleAttributeMappingModalView = ({
  attributes,
  database,
  mapping,
  onSave,
  onCancel,
}: RoleAttributeMappingModalViewProps) => {
  const initialValues = mapping ?? ROLE_ATTRIBUTION_MAPPING_SCHEMA.getDefault();
  const databaseUser = database.details.user;

  const hasAttributes = attributes.length > 0;
  const attributeOptions = useMemo(
    () => attributes.map(attribute => ({ name: attribute, value: attribute })),
    [attributes],
  );

  return (
    <RoleAttributeMappingModalViewRoot>
      <h2>{t`Map a user attribute to database roles`}</h2>
      <RoleAttributeMappingDescription>
        {t`When people run a query (including native queries), Metabase will impersonate the privileges of the role you associate with the user attribute.`}{" "}
        <Link
          className="link"
          // FIXME: update the link once the docs page is ready
          to={MetabaseSettings.docsUrl("/learn/permissions/data-permissions")}
        >{t`Learn More`}</Link>
      </RoleAttributeMappingDescription>

      {hasAttributes ? (
        <FormProvider
          initialValues={initialValues}
          validationSchema={ROLE_ATTRIBUTION_MAPPING_SCHEMA}
          enableReinitialize
          onSubmit={onSave}
        >
          {({ dirty, isValid }) => (
            <Form disabled={!dirty}>
              <FormSelect
                name="attribute"
                placeholder={t`Pick a user attribute`}
                title={t`User attribute`}
                options={attributeOptions}
              />

              {databaseUser != null ? (
                <RoleAttributeMappingAlert icon="warning" variant="warning">
                  {t`${database.details.name} is the user for the ${database.name} connection configuration. Make sure it has access to everything different user groups may need access to. It's what Metabase uses to sync table information.`}{" "}
                  <Link
                    className="link"
                    to={Urls.editDatabase(database.id)}
                  >{t`Edit settings`}</Link>
                </RoleAttributeMappingAlert>
              ) : null}

              <FormInput
                infoTooltip={t`Users with empty attributes will run queries using this role. We also restore the connection to this role after every query.`}
                name="default_role"
                title={t`Default role`}
                placeholder={t`Enter a default/reset role`}
              />

              <FormFooter>
                <FormErrorMessage inline />
                <Button type="button" onClick={onCancel}>{t`Cancel`}</Button>
                <FormSubmitButton
                  title={t`Save`}
                  disabled={!isValid || !dirty}
                  primary
                />
              </FormFooter>
            </Form>
          )}
        </FormProvider>
      ) : (
        <>
          <Alert icon="info">{t`You don't have any user attributes yet.`}</Alert>

          <FormFooter>
            <Button type="button" onClick={onCancel}>{t`Got it`}</Button>
          </FormFooter>
        </>
      )}
    </RoleAttributeMappingModalViewRoot>
  );
};

export default RoleAttributeMappingModalView;
