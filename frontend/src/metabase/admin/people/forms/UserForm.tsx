import { useField } from "formik";
import type { HTMLAttributes } from "react";
import { t } from "ttag";
import _ from "underscore";
import * as Yup from "yup";

import { MembershipSelect } from "metabase/admin/people/components/MembershipSelect";
import { useListPermissionsGroupsQuery } from "metabase/api";
import { FormField } from "metabase/common/components/FormField";
import { FormFooter } from "metabase/common/components/FormFooter";
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
import { Button } from "metabase/ui";
import * as Errors from "metabase/utils/errors";
import { isAdminGroup, isDefaultGroup } from "metabase/utils/groups";
import type { GroupId, Member, User, UserId } from "metabase-types/api";

const localUserSchema = Yup.object({
  first_name: Yup.string().nullable().max(100, Errors.maxLength).default(null),
  last_name: Yup.string().nullable().max(100, Errors.maxLength).default(null),
  email: Yup.string().email().required(Errors.required),
});

const externalUserSchema = localUserSchema.shape({
  tenant_id: Yup.number().required(Errors.required),
});

interface FormGroupsWidgetProps extends HTMLAttributes<HTMLDivElement> {
  name: string;
  external?: boolean;
}

const FormGroupsWidget = ({
  name,
  className,
  style,
  title = t`Groups`,
  external,
}: FormGroupsWidgetProps) => {
  const [{ value: formValue }, , { setValue }] =
    useField<{ id: GroupId; is_group_manager?: boolean }[]>(name);

  const { data: groups, isLoading } = useListPermissionsGroupsQuery({
    tenancy: external ? "external" : "internal",
  });

  if (isLoading || !groups) {
    return null;
  }

  const adminGroup = _.find(groups, isAdminGroup);
  const defaultGroup = _.find(
    groups,
    external ? PLUGIN_TENANTS.isExternalUsersGroup : isDefaultGroup,
  );

  const value = formValue ?? [
    { id: defaultGroup?.id, is_group_manager: false },
  ];

  const memberships = value.reduce((acc, { id, ...membershipData }) => {
    if (id != null) {
      acc.set(id, membershipData);
    }
    return acc;
  }, new Map());

  const isUserAdmin = memberships.has(adminGroup?.id);

  const handleAdd = (groupId: GroupId, membershipData: Partial<Member>) => {
    const updatedValue = Array.from(memberships.entries()).map(
      ([id, membershipData]) => {
        return {
          id,
          ...membershipData,
        };
      },
    );

    updatedValue.push({ id: groupId, ...membershipData });
    setValue(updatedValue);
  };

  const handleRemove = (groupId: GroupId) => {
    const updatedValue = Array.from(memberships.entries())
      .map(([id, membershipData]) => {
        if (id === groupId) {
          return null;
        }

        return {
          id,
          ...membershipData,
        };
      })
      .filter(Boolean);

    setValue(updatedValue);
  };
  const handleChange = (
    groupId: GroupId,
    newMembershipData: Partial<Member>,
  ) => {
    const updatedValue = Array.from(memberships.entries()).map(
      ([id, membershipData]) => {
        const data = groupId === id ? newMembershipData : membershipData;
        return {
          id,
          ...data,
        };
      },
    );

    setValue(updatedValue);
  };

  return (
    <FormField className={className} style={style} title={title}>
      <MembershipSelect
        groups={groups}
        memberships={memberships}
        onAdd={handleAdd}
        onRemove={handleRemove}
        onChange={handleChange}
        isUserAdmin={isUserAdmin}
      />
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
}

export const UserForm = ({
  initialValues = {},
  onSubmit,
  onCancel,
  submitText = t`Update`,
  external = false,
  edit = false,
  userId,
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
          />
          {external && (
            <PLUGIN_TENANTS.FormTenantWidget
              required
              name="tenant_id"
              placeholder={t`Select a tenant`}
              disabled={edit}
            />
          )}
          <PLUGIN_ADMIN_USER_FORM_FIELDS.FormLoginAttributes userId={userId} />
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
