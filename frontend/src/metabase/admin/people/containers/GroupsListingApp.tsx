import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import {
  useCreatePermissionsGroupMutation,
  useDeletePermissionsGroupMutation,
  useListPermissionsGroupsQuery,
  useUpdatePermissionsGroupMutation,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { PLUGIN_GROUP_MANAGERS } from "metabase/plugins";
import { getUserIsAdmin } from "metabase/selectors/user";
import type { Group } from "metabase-types/api";

import { GroupsListing } from "../components/GroupsListing";

export const GroupsListingApp = () => {
  const dispatch = useDispatch();
  const isAdmin = useSelector(getUserIsAdmin);

  const { data, isLoading, error } = useListPermissionsGroupsQuery();
  const groups = data ?? [];

  const [createGroup] = useCreatePermissionsGroupMutation();
  const [updateGroup] = useUpdatePermissionsGroupMutation();
  const [deleteGroup] = useDeletePermissionsGroupMutation();

  const handleCreate = async (group: { name: string }) => {
    await createGroup(group).unwrap();
  };

  const handleUpdate = async (group: { id: number; name: string }) => {
    await updateGroup(group).unwrap();
  };

  const handleDelete = async (
    group: Omit<Group, "members">,
    groupCount: number,
  ) => {
    if (PLUGIN_GROUP_MANAGERS.deleteGroup) {
      await dispatch(PLUGIN_GROUP_MANAGERS.deleteGroup(group, groupCount));
    } else {
      await deleteGroup(group.id).unwrap();
    }
  };

  return (
    <SettingsPageWrapper title={t`Groups`}>
      <SettingsSection>
        <LoadingAndErrorWrapper error={error} loading={isLoading}>
          <GroupsListing
            isAdmin={isAdmin}
            groups={groups}
            create={handleCreate}
            update={handleUpdate}
            delete={handleDelete}
          />
        </LoadingAndErrorWrapper>
      </SettingsSection>
    </SettingsPageWrapper>
  );
};
