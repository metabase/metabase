import { useField } from "formik";
import type { HTMLAttributes } from "react";
import { t } from "ttag";
import _ from "underscore";

import MembershipSelect from "metabase/admin/people/components/MembershipSelect";
import { useGroupListQuery } from "metabase/common/hooks";
import FormField from "metabase/core/components/FormField";
import { isDefaultGroup, isAdminGroup } from "metabase/lib/groups";
import type { GroupId, Member } from "metabase-types/api";

interface FormGroupsWidgetProps extends HTMLAttributes<HTMLDivElement> {
  name: string;
}

export const FormGroupsWidget = ({
  name,
  className,
  style,
  title = t`Groups`,
}: FormGroupsWidgetProps) => {
  const [{ value: formValue }, , { setValue }] =
    useField<{ id: GroupId; is_group_manager?: boolean }[]>(name);

  const { data: groups, isLoading } = useGroupListQuery();

  if (isLoading || !groups) {
    return null;
  }

  const adminGroup = _.find(groups, isAdminGroup);
  const defaultGroup = _.find(groups, isDefaultGroup);

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
