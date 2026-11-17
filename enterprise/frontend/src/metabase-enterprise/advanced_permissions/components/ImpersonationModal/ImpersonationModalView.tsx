/* eslint-disable metabase/no-literal-metabase-strings */
import { useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import { ExternalLink } from "metabase/common/components/ExternalLink/ExternalLink";
import { Link } from "metabase/common/components/Link/Link";
import { useDocsUrl } from "metabase/common/hooks";
import CS from "metabase/css/core/index.css";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSelect,
  FormSubmitButton,
} from "metabase/forms";
import { Button, Modal, Stack, Text } from "metabase/ui";
import * as Errors from "metabase/utils/errors";
import { impersonatesUsers } from "metabase-enterprise/advanced_permissions/utils";
import { renderUserAttributesForSelect } from "metabase-enterprise/sandboxes/utils";
import type { Database, UserAttributeKey } from "metabase-types/api";

import { ImpersonationWarning } from "../ImpersonationWarning";

import { ImpersonationNotice } from "./ImpersonationNotice";

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

  // eslint-disable-next-line metabase/no-unconditional-metabase-links-render -- Only shows for admins.
  const { url: permsDocsUrl } = useDocsUrl("permissions/data");

  const modalMessage = impersonatesUsers(database)
    ? t`When the person runs a query (including native queries), Metabase will impersonate the privileges of the database user you associate with the user attribute.`
    : t`When the person runs a query (including native queries), Metabase will impersonate the privileges of the database role you associate with the user attribute.`;

  const description = (
    <Text lh="lg">
      {modalMessage}{" "}
      <ExternalLink
        className={CS.link}
        href={permsDocsUrl}
      >{t`Learn More`}</ExternalLink>
    </Text>
  );

  if (roleRequired) {
    return (
      <ImpersonationNotice description={description} onClose={onCancel}>
        {t`Connection impersonation requires specifying a user role on the database connection.`}{" "}
        <Link
          variant="brand"
          to={`/admin/databases/${database.id}`}
        >{t`Edit connection`}</Link>
      </ImpersonationNotice>
    );
  }

  if (!hasAttributes) {
    return (
      <ImpersonationNotice description={description} onClose={onCancel}>
        {t`To associate a user with a database role, you'll need to give that user at least one user attribute.`}{" "}
        <Link variant="brand" to="/admin/people">{t`Edit user settings`}</Link>
      </ImpersonationNotice>
    );
  }

  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={ROLE_ATTRIBUTION_MAPPING_SCHEMA}
      enableReinitialize
      onSubmit={handleSubmit}
    >
      {({ isValid }) => (
        <Form>
          <Stack gap="xl">
            {description}
            <FormSelect
              name="attribute"
              placeholder={t`Pick a user attribute`}
              label={t`User attribute`}
              data={attributeOptions}
              renderOption={renderUserAttributesForSelect}
            />
            <ImpersonationWarning database={database} />
          </Stack>

          <Modal.Footer>
            <FormErrorMessage flex={1} />
            <Button type="button" onClick={onCancel}>{t`Cancel`}</Button>
            <FormSubmitButton
              label={t`Save`}
              disabled={!isValid}
              variant="filled"
            />
          </Modal.Footer>
        </Form>
      )}
    </FormProvider>
  );
};
