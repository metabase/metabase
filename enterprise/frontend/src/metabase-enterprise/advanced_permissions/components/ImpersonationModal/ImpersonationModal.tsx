import { type ReactNode, useCallback, useMemo } from "react";
import { useMount } from "react-use";
import { t } from "ttag";
import * as Yup from "yup";

import { skipToken, useGetDatabaseQuery } from "metabase/api";
import { ExternalLink } from "metabase/common/components/ExternalLink/ExternalLink";
import { Link } from "metabase/common/components/Link/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import type { ModalComponentProps } from "metabase/common/components/ModalRoute";
import { useDocsUrl } from "metabase/common/hooks";
import CS from "metabase/css/core/index.css";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSelect,
  FormSubmitButton,
} from "metabase/forms";
import { updateDataPermission } from "metabase/permissions";
import { useDispatch } from "metabase/redux";
import { Alert, Button, Icon, Modal, Stack, Text } from "metabase/ui";
import { parseIntParam } from "metabase/urls";
import * as Errors from "metabase/utils/errors";
import { updateImpersonation } from "metabase-enterprise/advanced_permissions/reducer";
import { getImpersonation } from "metabase-enterprise/advanced_permissions/selectors";
import type {
  ImpersonationModalParams,
  ImpersonationParams,
} from "metabase-enterprise/advanced_permissions/types";
import { getImpersonatedDatabaseId } from "metabase-enterprise/advanced_permissions/utils";
import { useGetImpersonationQuery } from "metabase-enterprise/api";
import { useEnterpriseSelector } from "metabase-enterprise/redux";
import { renderUserAttributesForSelect } from "metabase-enterprise/sandboxes/utils";
import { fetchUserAttributes } from "metabase-enterprise/shared/reducer";
import { getUserAttributes } from "metabase-enterprise/shared/selectors";
import {
  DataPermission,
  DataPermissionType,
  DataPermissionValue,
  type Database,
  type UserAttributeKey,
} from "metabase-types/api";

import { ImpersonationWarning } from "../ImpersonationWarning";

const ROLE_ATTRIBUTION_MAPPING_SCHEMA = Yup.object({
  attribute: Yup.string().required(Errors.required).default(""),
});

// for redshift, we impersonate using users, not roles
const impersonatesUsers = (database: Database) =>
  database.engine === "redshift";

const getImpersonationModalTitle = (database: Database) =>
  impersonatesUsers(database)
    ? // eslint-disable-next-line metabase/no-literal-metabase-strings -- Metabase settings
      t`Map a Metabase user attribute to database users`
    : t`Map a user attribute to database roles`;

const parseParams = (params: ImpersonationModalParams): ImpersonationParams => {
  // NaN preserves the pre-conversion parseInt behavior for the
  // route-guaranteed param
  const groupId = parseIntParam(params.groupId) ?? NaN;
  const databaseId = getImpersonatedDatabaseId(params);

  return {
    groupId,
    databaseId,
  };
};

export const ImpersonationModal = ({
  params,
  onClose,
}: ModalComponentProps) => {
  const { groupId, databaseId } = parseParams(params);

  const {
    data: database,
    isLoading: isDatabaseLoading,
    error,
  } = useGetDatabaseQuery(databaseId != null ? { id: databaseId } : skipToken);

  const attributes = useEnterpriseSelector(getUserAttributes);
  const draftImpersonation = useEnterpriseSelector(
    getImpersonation(databaseId, groupId),
  );

  const {
    data: impersonation,
    isLoading: isImpersonationLoading,
    error: impersonationError,
  } = useGetImpersonationQuery(
    { db_id: databaseId, group_id: groupId },
    { skip: Boolean(draftImpersonation) },
  );

  const selectedAttribute =
    draftImpersonation?.attribute ?? impersonation?.attribute;

  const dispatch = useDispatch();

  const handleSave = useCallback(
    (attribute: UserAttributeKey) => {
      dispatch(
        updateDataPermission({
          groupId,
          permission: {
            type: DataPermissionType.ACCESS,
            permission: DataPermission.VIEW_DATA,
          },
          value: DataPermissionValue.IMPERSONATED,
          entityId: { databaseId },
          view: "group",
        }),
      );

      if (attribute !== selectedAttribute) {
        dispatch(
          updateImpersonation({
            attribute,
            db_id: databaseId,
            group_id: groupId,
          }),
        );
      }

      onClose();
    },
    [onClose, databaseId, dispatch, groupId, selectedAttribute],
  );

  useMount(() => {
    dispatch(fetchUserAttributes());
  });

  const isLoading =
    isDatabaseLoading || isImpersonationLoading || !attributes || !database;

  return (
    <Modal
      opened
      density="relaxed"
      withCloseButton={false}
      title={database ? getImpersonationModalTitle(database) : undefined}
      onClose={onClose}
    >
      {isLoading ? (
        <LoadingAndErrorWrapper
          loading={isLoading}
          error={error ?? impersonationError}
        />
      ) : (
        <ImpersonationModalView
          selectedAttribute={selectedAttribute}
          attributes={attributes}
          database={database}
          onSave={handleSave}
          onCancel={onClose}
        />
      )}
    </Modal>
  );
};

type ImpersonationModalViewProps = {
  attributes: UserAttributeKey[];
  selectedAttribute?: UserAttributeKey;
  database: Database;
  onSave: (attribute: UserAttributeKey) => void;
  onCancel: () => void;
};

const ImpersonationModalView = ({
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
    ? // eslint-disable-next-line metabase/no-literal-metabase-strings -- Metabase settings
      t`When the person runs a query (including native queries), Metabase will impersonate the privileges of the database user you associate with the user attribute.`
    : // eslint-disable-next-line metabase/no-literal-metabase-strings -- Metabase settings
      t`When the person runs a query (including native queries), Metabase will impersonate the privileges of the database role you associate with the user attribute.`;

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

type ImpersonationNoticeProps = {
  description: ReactNode;
  children: ReactNode;
  onClose: () => void;
};

const ImpersonationNotice = ({
  description,
  children,
  onClose,
}: ImpersonationNoticeProps) => (
  <>
    <Stack gap="xl">
      {description}
      <Alert size="compact" icon={<Icon name="warning" />} color="warning">
        {children}
      </Alert>
    </Stack>

    <Modal.Footer>
      <Button type="button" onClick={onClose}>{t`Close`}</Button>
    </Modal.Footer>
  </>
);
