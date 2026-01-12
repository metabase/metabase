import type { ReactNode } from "react";
import type { Route } from "react-router";
import { useAsync } from "react-use";
import _ from "underscore";

import { skipToken, useGetDatabaseMetadataQuery } from "metabase/api";
import { Databases } from "metabase/entities/databases";
import { Groups } from "metabase/entities/groups";
import { isAdminGroup, isDefaultGroup } from "metabase/lib/groups";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";
import { PermissionsApi } from "metabase/services";
import { Center, Loader } from "metabase/ui";
import type Database from "metabase-lib/v1/metadata/Database";
import type { DatabaseId, Group, PermissionsGraph } from "metabase-types/api";

import { DataPermissionsHelp } from "../../components/DataPermissionsHelp";
import { PermissionsPageLayout } from "../../components/PermissionsPageLayout/PermissionsPageLayout";
import {
  LOAD_DATA_PERMISSIONS_FOR_GROUP,
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
  groups: Group[];
};

function DataPermissionsPage({
  children,
  route,
  params,
  databases,
  groups,
}: DataPermissionsPageProps) {
  const isDirty = useSelector(getIsDirty);
  const diff = useSelector((state) => getDiff(state, { databases, groups }));
  const showSplitPermsModal = useSelector((state) =>
    getSetting(state, "show-updated-permission-modal"),
  );
  const dispatch = useDispatch();

  const resetPermissions = () => dispatch(restoreLoadedPermissions());
  const savePermissions = () => dispatch(saveDataPermissions());

  const { loading: isLoadingAllUsers } = useAsync(async () => {
    const allUsers = groups.find(isDefaultGroup);
    const result = await PermissionsApi.graphForGroup({
      groupId: allUsers?.id,
    });
    await dispatch({ type: LOAD_DATA_PERMISSIONS_FOR_GROUP, payload: result });
  }, []);

  const { loading: isLoadingAdminstrators } = useAsync(async () => {
    const admins = groups.find(isAdminGroup);
    const result = await PermissionsApi.graphForGroup({
      groupId: admins?.id,
    });
    await dispatch({ type: LOAD_DATA_PERMISSIONS_FOR_GROUP, payload: result });
  }, []);

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

  if (isLoadingAllUsers || isLoadingAdminstrators || isLoadingTables) {
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
      diff={diff as PermissionsGraph}
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
export default _.compose(
  Groups.loadList(),
  Databases.loadList({
    selectorName: "getListUnfiltered",
  }),
)(DataPermissionsPage);
