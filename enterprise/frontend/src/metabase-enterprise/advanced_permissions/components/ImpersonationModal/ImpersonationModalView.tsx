import React, { useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";
import FormSelect from "metabase/core/components/FormSelect";
import FormProvider from "metabase/core/components/FormProvider";
import FormSubmitButton from "metabase/core/components/FormSubmitButton";
import FormErrorMessage from "metabase/core/components/FormErrorMessage";
import Form from "metabase/core/components/Form";
import MetabaseSettings from "metabase/lib/settings";
import * as Errors from "metabase/core/utils/errors";
import { Database, UserAttribute } from "metabase-types/api";
import Alert from "metabase/core/components/Alert";
import FormFooter from "metabase/core/components/FormFooter";
import Button from "metabase/core/components/Button";
import ExternalLink from "metabase/core/components/ExternalLink/ExternalLink";
import { ImpersonationWarning } from "../ImpersonationWarning";
import {
  ImpersonationDescription,
  ImpersonationModalViewRoot,
} from "./ImpersonationModalView.styled";

const ROLE_ATTRIBUTION_MAPPING_SCHEMA = Yup.object({
  attribute: Yup.string().required(Errors.required).default(""),
});

type ImpersonationModalViewProps = {
  attributes: UserAttribute[];
  selectedAttribute?: UserAttribute;
  database: Database;
  onSave: (attribute: UserAttribute) => void;
  onCancel: () => void;
};

export const ImpersonationModalView = ({
  attributes,
  database,
  selectedAttribute,
  onSave,
  onCancel,
}: ImpersonationModalViewProps) => {
  const initialValues = {
    attribute:
      selectedAttribute ??
      (attributes.length === 1 ? attributes[0] : undefined),
  };

  const hasAttributes = attributes.length > 0;
  const attributeOptions = useMemo(
    () => attributes.map(attribute => ({ name: attribute, value: attribute })),
    [attributes],
  );

  const handleSubmit = ({ attribute }: { attribute?: UserAttribute }) => {
    if (attribute != null) {
      onSave(attribute);
    }
  };

  return (
    <ImpersonationModalViewRoot>
      <h2>{t`Map a user attribute to database roles`}</h2>
      <ImpersonationDescription>
        {t`When the person runs a query (including native queries), Metabase will impersonate the privileges of the database role you associate with the user attribute.`}{" "}
        <ExternalLink
          className="link"
          // FIXME: update the link once the docs page is ready
          href={MetabaseSettings.docsUrl("learn/permissions/data-permissions")}
        >{t`Learn More`}</ExternalLink>
      </ImpersonationDescription>

      {hasAttributes ? (
        <FormProvider
          initialValues={initialValues}
          validationSchema={ROLE_ATTRIBUTION_MAPPING_SCHEMA}
          enableReinitialize
          onSubmit={handleSubmit}
        >
          {({ dirty, isValid }) => (
            <Form disabled={!dirty}>
              <FormSelect
                name="attribute"
                placeholder={t`Pick a user attribute`}
                title={t`User attribute`}
                options={attributeOptions}
              />

              <ImpersonationWarning database={database} />

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
    </ImpersonationModalViewRoot>
  );
};
