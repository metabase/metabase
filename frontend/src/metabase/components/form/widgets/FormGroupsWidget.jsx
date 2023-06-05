/* eslint-disable react/prop-types */
import _ from "underscore";
import MembershipSelect from "metabase/admin/people/components/MembershipSelect";

import Group from "metabase/entities/groups";

import { isDefaultGroup, isAdminGroup } from "metabase/lib/groups";

const FormGroupsWidget = ({ field: { value, onChange }, groups }) => {
  const adminGroup = _.find(groups, isAdminGroup);
  const defaultGroup = _.find(groups, isDefaultGroup);

  if (!value) {
    value = [{ id: defaultGroup.id, is_group_manager: false }];
  }

  const memberships = value.reduce((acc, { id, ...membershipData }) => {
    if (id != null) {
      acc.set(id, membershipData);
    }
    return acc;
  }, new Map());

  const isUserAdmin = memberships.has(adminGroup.id);

  const handleAdd = (groupId, membershipData) => {
    const updatedValue = Array.from(memberships.entries()).map(
      ([id, membershipData]) => {
        return {
          id,
          ...membershipData,
        };
      },
    );

    updatedValue.push({ id: groupId, ...membershipData });
    onChange(updatedValue);
  };

  const handleRemove = groupId => {
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

    onChange(updatedValue);
  };
  const handleChange = (groupId, newMembershipData) => {
    const updatedValue = Array.from(memberships.entries()).map(
      ([id, membershipData]) => {
        const data = groupId === id ? newMembershipData : membershipData;
        return {
          id,
          ...data,
        };
      },
    );

    onChange(updatedValue);
  };

  return (
    <MembershipSelect
      groups={groups}
      memberships={memberships}
      onAdd={handleAdd}
      onRemove={handleRemove}
      onChange={handleChange}
      isUserAdmin={isUserAdmin}
    />
  );
};

export default Group.loadList()(FormGroupsWidget);
