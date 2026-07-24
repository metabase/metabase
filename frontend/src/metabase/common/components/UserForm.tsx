import { useField } from "formik";
import type { HTMLAttributes } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import { FormField } from "metabase/common/components/FormField";
import { FormFooter } from "metabase/common/components/FormFooter";
import { GroupsMultiSelect } from "metabase/common/components/GroupsMultiSelect";
import { isAdminGroup, isDefaultGroup } from "metabase/common/utils/groups";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import {
  PLUGIN_ADMIN_USER_FORM_FIELDS,
  PLUGIN_TENANTS,
} from "metabase/plugins";
import { Alert, Button } from "metabase/ui";
import * as Errors from "metabase/utils/errors";
import type { GroupId, GroupInfo, User, UserId } from "metabase-types/api";

const localUserSchema = Yup.object({
  first_name: Yup.string().nullable().max(100, Errors.maxLength).default(null),
  last_name: Yup.string().nullable().max(100, Errors.maxLength).default(null),
  email: Yup.string().email().required(Errors.required),
});

const externalUserSchema = localUserSchema.shape({
  tenant_id: Yup.number().required(Errors.required),
});

// Groups granting access to the invite target; drives the sectioned dropdown and the no-access warning.
interface GroupAccessInfo {
  groupIds: GroupId[];
  sectionLabel: string;
  warningMessage: string;
}

interface FormGroupsWidgetProps extends HTMLAttributes<HTMLDivElement> {
  name: string;
  external?: boolean;
  groups?: GroupInfo[];
  groupAccess?: GroupAccessInfo;
}

const FormGroupsWidget = ({
  name,
  className,
  style,
  title = t`Groups`,
  external,
  groups,
  groupAccess,
}: FormGroupsWidgetProps) => {
  const [{ value: formValue }, , { setValue }] =
    useField<{ id: GroupId; is_group_manager?: boolean }[]>(name);

  if (!groups) {
    return null;
  }

  const defaultGroup = groups.find(
    external ? PLUGIN_TENANTS.isExternalUsersGroup : isDefaultGroup,
  );

  const memberships =
    formValue ??
    (defaultGroup ? [{ id: defaultGroup.id, is_group_manager: false }] : []);

  const handleChange = (groupIds: GroupId[]) => {
    const ids = defaultGroup
      ? Array.from(new Set([defaultGroup.id, ...groupIds]))
      : groupIds;

    // Preserve each group's manager flag across selection changes.
    setValue(
      ids.map((id) => ({
        id,
        is_group_manager:
          memberships.find((membership) => membership.id === id)
            ?.is_group_manager ?? false,
      })),
    );
  };

  const managerGroupIds = memberships
    .filter((membership) => membership.is_group_manager)
    .map((membership) => membership.id);

  const handleToggleManager = (groupId: GroupId) => {
    setValue(
      memberships.map((membership) =>
        membership.id === groupId
          ? { ...membership, is_group_manager: !membership.is_group_manager }
          : membership,
      ),
    );
  };

  const adminGroupId = groups.find(isAdminGroup)?.id;
  const showNoAccessWarning =
    groupAccess != null &&
    !memberships.some(
      ({ id }) => id === adminGroupId || groupAccess.groupIds.includes(id),
    );

  return (
    <FormField className={className} style={style} title={title}>
      <GroupsMultiSelect
        groups={groups}
        value={memberships.map((membership) => membership.id)}
        onChange={handleChange}
        managerGroupIds={managerGroupIds}
        onToggleManager={handleToggleManager}
        itemAccessGroups={
          groupAccess && {
            groupIds: groupAccess.groupIds,
            label: groupAccess.sectionLabel,
          }
        }
      />
      {showNoAccessWarning && (
        <Alert color="warning" mt="sm">
          {groupAccess?.warningMessage}
        </Alert>
      )}
    </FormField>
  );
};

interface UserFormProps {
  initialValues?: Partial<User>;
  onSubmit: (val: Partial<User>) => void;
  onCancel: () => void;
  submitText?: string;
  external?: boolean;
  edit?: boolean;
  userId?: UserId | null;
  hideNameFields?: boolean;
  hideAttributes?: boolean;
  groups?: GroupInfo[];
  groupAccess?: GroupAccessInfo;
}

export const UserForm = ({
  initialValues = {},
  onSubmit,
  onCancel,
  submitText = t`Update`,
  external = false,
  edit = false,
  userId,
  hideNameFields = false,
  hideAttributes = false,
  groups,
  groupAccess,
}: UserFormProps) => {
  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={external ? externalUserSchema : localUserSchema}
      enableReinitialize
      onSubmit={onSubmit}
    >
      {({ dirty }: { dirty: boolean }) => (
        <Form disabled={!dirty}>
          {!hideNameFields && (
            <>
              <FormTextInput
                name="first_name"
                title={t`First name`}
                placeholder={t`Johnny`}
                label={t`First name`}
                mb="md"
                nullable
              />
              <FormTextInput
                name="last_name"
                title={t`Last name`}
                placeholder={t`Appleseed`}
                label={t`Last name`}
                mb="md"
                nullable
              />
            </>
          )}
          <FormTextInput
            name="email"
            type="email"
            title={t`Email`}
            placeholder="nicetoseeyou@email.com"
            label={t`Email`}
            required
            mb="md"
          />
          <FormGroupsWidget
            name="user_group_memberships"
            external={external}
            title={PLUGIN_TENANTS.getFormGroupsTitle(external) ?? t`Groups`}
            groups={groups}
            groupAccess={groupAccess}
          />
          {external && (
            <PLUGIN_TENANTS.FormTenantWidget
              required
              name="tenant_id"
              placeholder={t`Select a tenant`}
              disabled={edit}
            />
          )}
          {!hideAttributes && (
            <PLUGIN_ADMIN_USER_FORM_FIELDS.FormLoginAttributes
              userId={userId}
            />
          )}
          <FormFooter>
            <FormErrorMessage inline />
            <Button type="button" onClick={onCancel}>{t`Cancel`}</Button>
            <FormSubmitButton
              label={submitText}
              disabled={!dirty}
              variant="filled"
            />
          </FormFooter>
        </Form>
      )}
    </FormProvider>
  );
};
