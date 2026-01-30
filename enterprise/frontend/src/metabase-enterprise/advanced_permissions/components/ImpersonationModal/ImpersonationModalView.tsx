import { useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import { Alert } from "metabase/common/components/Alert";
import { Button } from "metabase/common/components/Button";
import { ExternalLink } from "metabase/common/components/ExternalLink/ExternalLink";
import { FormErrorMessage } from "metabase/common/components/FormErrorMessage";
import { FormFooter } from "metabase/common/components/FormFooter";
import { FormSubmitButton } from "metabase/common/components/FormSubmitButton";
import { Link } from "metabase/common/components/Link/Link";
import { useDocsUrl } from "metabase/common/hooks";
import CS from "metabase/css/core/index.css";
import { Form, FormProvider, FormSelect } from "metabase/forms";
import * as Errors from "metabase/lib/errors";
import { renderUserAttributesForSelect } from "metabase-enterprise/sandboxes/utils";
import type Database from "metabase-lib/v1/metadata/Database";
import type { UserAttributeKey } from "metabase-types/api";

import { ImpersonationWarning } from "../ImpersonationWarning";

import {
  ImpersonationDescription,
  ImpersonationModalViewRoot,
} from "./ImpersonationModalView.styled";

const ROLE_ATTRIBUTION_MAPPING_SCHEMA = Yup.object({
  attribute: Yup.string().required(Errors.required).default(""),
});

type ImpersonationModalViewProps = {
  attributes: UserAttributeKey[];
  selectedAttribute?: UserAttributeKey;
  database: Database;
  onSave: (attribute: UserAttributeKey) => void;
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

    return selectableAttributes;
  }, [attributes, selectedAttribute]);

  const hasAttributes = attributeOptions.length > 0;

  const handleSubmit = ({ attribute }: { attribute?: UserAttributeKey }) => {
    if (attribute != null) {
      onSave(attribute);
    }
  };

  // Does the "role" field need to first be filled out on the DB details page?
  const roleRequired =
    database.features?.includes("connection-impersonation-requires-role") &&
    (!database.details || database.details["role"] == null);

  // for redshift, we impersonate using users, not roles
  const impersonationUsesUsers = database.engine === "redshift";
  // eslint-disable-next-line metabase/no-unconditional-metabase-links-render -- Only shows for admins.
  const { url: permsDocsUrl } = useDocsUrl("permissions/data");

  const modalTitle = impersonationUsesUsers
    ? // eslint-disable-next-line metabase/no-literal-metabase-strings -- Metabase settings
      t`Map a Metabase user attribute to database users`
    : t`Map a user attribute to database roles`;

  const modalMessage = impersonationUsesUsers
    ? // eslint-disable-next-line metabase/no-literal-metabase-strings -- Metabase settings
      t`When the person runs a query (including native queries), Metabase will impersonate the privileges of the database user you associate with the user attribute.`
    : // eslint-disable-next-line metabase/no-literal-metabase-strings -- Metabase settings
      t`When the person runs a query (including native queries), Metabase will impersonate the privileges of the database role you associate with the user attribute.`;

  return (
    <ImpersonationModalViewRoot>
      <h2>{modalTitle}</h2>
      <ImpersonationDescription>
        {modalMessage}{" "}
        <ExternalLink
          className={CS.link}
          href={permsDocsUrl}
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
                label={t`User attribute`}
                data={attributeOptions}
                mb="1.25rem"
                renderOption={renderUserAttributesForSelect}
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
