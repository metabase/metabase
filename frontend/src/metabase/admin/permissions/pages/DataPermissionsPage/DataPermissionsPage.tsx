import { useAsync } from "react-use";

import {
  skipToken,
  useGetDatabaseMetadataQuery,
  useListDatabasesQuery,
  useListPermissionsGroupsQuery,
} from "metabase/api";
import { isAdminGroup, isDefaultGroup } from "metabase/common/utils/groups";
import { useDispatch, useSelector } from "metabase/redux";
import { Outlet, useParams } from "metabase/router";
import { Center, Loader } from "metabase/ui";
import type { GroupInfo } from "metabase-types/api";

import { DataPermissionsHelp } from "../../components/DataPermissionsHelp";
import { PermissionsPageLayout } from "../../components/PermissionsPageLayout/PermissionsPageLayout";
import {
  loadDataPermissionsForGroup,
  restoreLoadedPermissions,
  saveDataPermissions,
} from "../../permissions";
import { DATABASE_TABLES_QUERY } from "../../selectors/data-permissions/databases";
import { getDiff, getIsDirty } from "../../selectors/data-permissions/diff";

const EMPTY_GROUP_LIST: GroupInfo[] = [];

export function DataPermissionsPage() {
  const params = useParams<{ databaseId: string }>();
  const { isLoading: isLoadingDatabases } = useListDatabasesQuery();
  const { data, isLoading: isLoadingGroups } = useListPermissionsGroupsQuery(
    {},
  );
  const groups = data ?? EMPTY_GROUP_LIST;
  const isDirty = useSelector(getIsDirty);
  const diff = useSelector((state) => getDiff(state, { groups }));
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
      ? { id: Number(params.databaseId), ...DATABASE_TABLES_QUERY }
      : skipToken,
  );

  if (
    isLoadingDatabases ||
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
      helpContent={<DataPermissionsHelp />}
      canShowSplitPermsModal
    >
      <Outlet />
    </PermissionsPageLayout>
  );
}
