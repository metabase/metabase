import React, { useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";
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
import ExternalLink from "metabase/core/components/ExternalLink/ExternalLink";
import RoleAccessWarning from "../RoleAccessWarning";
import {
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

  const hasAttributes = attributes.length > 0;
  const attributeOptions = useMemo(
    () => attributes.map(attribute => ({ name: attribute, value: attribute })),
    [attributes],
  );

  return (
    <RoleAttributeMappingModalViewRoot>
      <h2>{t`Map a user attribute to database roles`}</h2>
      <RoleAttributeMappingDescription>
        {t`When the person runs a query (including native queries), Metabase will impersonate the privileges of the database role you associate with the user attribute.`}{" "}
        <ExternalLink
          className="link"
          // FIXME: update the link once the docs page is ready
          href={MetabaseSettings.docsUrl("learn/permissions/data-permissions")}
        >{t`Learn More`}</ExternalLink>
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

              <RoleAccessWarning database={database} />

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
