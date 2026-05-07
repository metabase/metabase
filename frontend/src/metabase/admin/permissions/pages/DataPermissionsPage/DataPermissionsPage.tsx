import type { ReactNode } from "react";
import type { Route } from "react-router";
import { useAsync } from "react-use";

import {
  skipToken,
  useGetDatabaseMetadataQuery,
  useListPermissionsGroupsQuery,
} from "metabase/api";
import { Databases } from "metabase/entities/databases";
import { useDispatch, useSelector } from "metabase/redux";
import { getSetting } from "metabase/selectors/settings";
import { Center, Loader } from "metabase/ui";
import { isAdminGroup, isDefaultGroup } from "metabase/utils/groups";
import type Database from "metabase-lib/v1/metadata/Database";
import type { DatabaseId, GroupInfo } from "metabase-types/api";

import { DataPermissionsHelp } from "../../components/DataPermissionsHelp";
import { PermissionsPageLayout } from "../../components/PermissionsPageLayout/PermissionsPageLayout";
import {
  loadDataPermissionsForGroup,
  restoreLoadedPermissions,
  saveDataPermissions,
} from "../../permissions";
import { getDiff, getIsDirty } from "../../selectors/data-permissions/diff";

type DataPermissionsPageProps = {
  children: ReactNode;
  route: typeof Route;
  params: {
    databaseId: DatabaseId;
  };
  databases: Database[];
};

const EMPTY_GROUP_LIST: GroupInfo[] = [];

function DataPermissionsPage({
  children,
  route,
  params,
  databases,
}: DataPermissionsPageProps) {
  const { data, isLoading: isLoadingGroups } = useListPermissionsGroupsQuery(
    {},
  );
  const groups = data ?? EMPTY_GROUP_LIST;
  const isDirty = useSelector(getIsDirty);
  const diff = useSelector((state) => getDiff(state, { databases, groups }));
  const showSplitPermsModal = useSelector((state) =>
    getSetting(state, "show-updated-permission-modal"),
  );
  const dispatch = useDispatch();

  const resetPermissions = () => dispatch(restoreLoadedPermissions());
  const savePermissions = () => dispatch(saveDataPermissions());

  const { loading: isLoadingAllUsers } = useAsync(async () => {
    if (isLoadingGroups) {
      return;
    }
    const allUsers = groups.find(isDefaultGroup);
    await dispatch(loadDataPermissionsForGroup(allUsers?.id));
  }, [isLoadingGroups]);

  const { loading: isLoadingAdminstrators } = useAsync(async () => {
    if (isLoadingGroups) {
      return;
    }
    const admins = groups.find(isAdminGroup);
    await dispatch(loadDataPermissionsForGroup(admins?.id));
  }, [isLoadingGroups]);

  const { isLoading: isLoadingTables } = useGetDatabaseMetadataQuery(
    params.databaseId !== undefined
      ? {
          id: params.databaseId,
          include_hidden: true,
          remove_inactive: true,
          skip_fields: true,
        }
      : skipToken,
  );

  if (
    isLoadingGroups ||
    isLoadingAllUsers ||
    isLoadingAdminstrators ||
    isLoadingTables
  ) {
    return (
      <Center h="100%">
        <Loader size="lg" />
      </Center>
    );
  }

  return (
    <PermissionsPageLayout
      tab="data"
      onLoad={resetPermissions}
      onSave={savePermissions}
      diff={diff}
      isDirty={isDirty}
      route={route}
      helpContent={<DataPermissionsHelp />}
      showSplitPermsModal={showSplitPermsModal}
    >
      {children}
    </PermissionsPageLayout>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Databases.loadList({
  selectorName: "getListUnfiltered",
})(DataPermissionsPage);
