import { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

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
import { useSetting } from "metabase/common/hooks";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { PLUGIN_GROUP_MANAGERS, PLUGIN_TENANTS } from "metabase/plugins";
import { getUserIsAdmin } from "metabase/selectors/user";
import type { Group } from "metabase-types/api";

import { GroupsListing } from "../components/GroupsListing";

export const GroupsListingApp = ({
  external,
  description,
}: {
  external?: boolean;
  description?: string;
}) => {
  const dispatch = useDispatch();
  const isAdmin = useSelector(getUserIsAdmin);
  const isUsingTenants = useSetting("use-tenants");

  const { data, isLoading, error } = useListPermissionsGroupsQuery({});
  const groups = useMemo(() => {
    const [externalGroups, internalGroups] = _.partition(
      data ?? [],
      PLUGIN_TENANTS.isTenantGroup,
    );
    return external ? externalGroups : internalGroups;
  }, [data, external]);

  const [createGroup] = useCreatePermissionsGroupMutation();
  const [updateGroup] = useUpdatePermissionsGroupMutation();
  const [deleteGroup] = useDeletePermissionsGroupMutation();

  const handleCreate = async (group: { name: string }) => {
    await createGroup({
      ...group,
      is_tenant_group: external,
    }).unwrap();
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

  const pageTitle = useMemo(() => {
    if (!isUsingTenants) {
      return t`Groups`;
    }

    return external ? t`Tenant groups` : t`Internal groups`;
  }, [external, isUsingTenants]);

  return (
    <SettingsPageWrapper title={pageTitle}>
      <SettingsSection>
        <LoadingAndErrorWrapper error={error} loading={isLoading}>
          <GroupsListing
            description={description}
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
