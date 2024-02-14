import { useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";
import FormSelect from "metabase/core/components/FormSelect";
import { Form, FormProvider } from "metabase/forms";
import FormSubmitButton from "metabase/core/components/FormSubmitButton";
import FormErrorMessage from "metabase/core/components/FormErrorMessage";
import MetabaseSettings from "metabase/lib/settings";
import * as Errors from "metabase/lib/errors";
import type { UserAttribute } from "metabase-types/api";
import Alert from "metabase/core/components/Alert";
import FormFooter from "metabase/core/components/FormFooter";
import Button from "metabase/core/components/Button";
import ExternalLink from "metabase/core/components/ExternalLink/ExternalLink";
import Link from "metabase/core/components/Link/Link";
import type Database from "metabase-lib/metadata/Database";
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

  const attributeOptions = useMemo(() => {
    const selectableAttributes =
      selectedAttribute && !attributes.includes(selectedAttribute)
        ? [selectedAttribute, ...attributes]
        : attributes;

    return selectableAttributes.map(attribute => ({
      name: attribute,
      value: attribute,
    }));
  }, [attributes, selectedAttribute]);

  const hasAttributes = attributeOptions.length > 0;

  const handleSubmit = ({ attribute }: { attribute?: UserAttribute }) => {
    if (attribute != null) {
      onSave(attribute);
    }
  };

  // Does the "role" field need to first be filled out on the DB details page?
  const roleRequired =
    database.features.includes("connection-impersonation-requires-role") &&
    database.details["role"] == null;

  // for redshift, we impersonate using users, not roles
  const impersonationUsesUsers = database.engine === "redshift";

  const modalTitle = impersonationUsesUsers
    ? // eslint-disable-next-line no-literal-metabase-strings -- Metabase settings
      t`Map a Metabase user attribute to database users`
    : t`Map a user attribute to database roles`;

  const modalMessage = impersonationUsesUsers
    ? // eslint-disable-next-line no-literal-metabase-strings -- Metabase settings
      t`When the person runs a query (including native queries), Metabase will impersonate the privileges of the database user you associate with the user attribute.`
    : // eslint-disable-next-line no-literal-metabase-strings -- Metabase settings
      t`When the person runs a query (including native queries), Metabase will impersonate the privileges of the database role you associate with the user attribute.`;

  return (
    <ImpersonationModalViewRoot>
      <h2>{modalTitle}</h2>
      <ImpersonationDescription>
        {modalMessage}{" "}
        <ExternalLink
          className="link"
          // eslint-disable-next-line no-unconditional-metabase-links-render -- Admin settings
          href={MetabaseSettings.docsUrl("permissions/data")}
        >{t`Learn More`}</ExternalLink>
      </ImpersonationDescription>
      {roleRequired ? (
        <>
          <Alert icon="warning" variant="warning">
            {t`Connection impersonation requires specifying a user role on the database connection.`}{" "}
            <Link
              variant="brand"
              to={`/admin/databases/${database.id}`}
            >{t`Edit connection`}</Link>
          </Alert>

          <FormFooter hasTopBorder>
            <Button type="button" onClick={onCancel}>{t`Close`}</Button>
          </FormFooter>
        </>
      ) : hasAttributes ? (
        <FormProvider
          initialValues={initialValues}
          validationSchema={ROLE_ATTRIBUTION_MAPPING_SCHEMA}
          enableReinitialize
          onSubmit={handleSubmit}
        >
          {({ isValid }) => (
            <Form>
              <FormSelect
                name="attribute"
                placeholder={t`Pick a user attribute`}
                title={t`User attribute`}
                options={attributeOptions}
              />

              <ImpersonationWarning database={database} />

              <FormFooter hasTopBorder>
                <FormErrorMessage inline />
                <Button type="button" onClick={onCancel}>{t`Cancel`}</Button>
                <FormSubmitButton title={t`Save`} disabled={!isValid} primary />
              </FormFooter>
            </Form>
          )}
        </FormProvider>
      ) : (
        <>
          <Alert icon="warning" variant="warning">
            {t`To associate a user with a database role, you'll need to give that user at least one user attribute.`}{" "}
            <Link
              variant="brand"
              to="/admin/people"
            >{t`Edit user settings`}</Link>
          </Alert>

          <FormFooter hasTopBorder>
            <Button type="button" onClick={onCancel}>{t`Close`}</Button>
          </FormFooter>
        </>
      )}
    </ImpersonationModalViewRoot>
  );
};
