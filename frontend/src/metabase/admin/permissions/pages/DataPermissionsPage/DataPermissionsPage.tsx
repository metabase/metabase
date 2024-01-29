import type { ReactNode } from "react";
import { useAsync } from "react-use";
import _ from "underscore";
import type { Route } from "react-router";

import Groups from "metabase/entities/groups";
import Databases from "metabase/entities/databases";

import { useTableListQuery } from "metabase/common/hooks";

import { isAdminGroup, isDefaultGroup } from "metabase/lib/groups";
import { PermissionsApi } from "metabase/services";
import { Loader, Center } from "metabase/ui";

import type { DatabaseId, Group } from "metabase-types/api";
import { useDispatch, useSelector } from "metabase/lib/redux";
import type Database from "metabase-lib/metadata/Database";
import { getIsDirty, getDiff } from "../../selectors/data-permissions/diff";
import {
  saveDataPermissions,
  restoreLoadedPermissions,
  LOAD_DATA_PERMISSIONS_FOR_GROUP,
} from "../../permissions";
import PermissionsPageLayout from "../../components/PermissionsPageLayout/PermissionsPageLayout";
import { DataPermissionsHelp } from "../../components/DataPermissionsHelp";
import ToolbarUpsell from "../../components/ToolbarUpsell";

type DataPermissionsPageProps = {
  children: ReactNode;
  route: typeof Route;
  params: {
    databaseId: DatabaseId;
  };
  databases: Database[];
  groups: Group[];
};

export const DATA_PERMISSIONS_TOOLBAR_CONTENT = [
  <ToolbarUpsell key="upsell" />,
];

function DataPermissionsPage({
  children,
  route,
  params,
  databases,
  groups,
}: DataPermissionsPageProps) {
  const isDirty = useSelector(getIsDirty);
  const diff = useSelector(state => getDiff(state, { databases, groups }));

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

  const { isLoading: isLoadingTables } = useTableListQuery({
    query: {
      dbId: params.databaseId,
      include_hidden: true,
      remove_inactive: true,
    },
    enabled: params.databaseId !== undefined,
  });

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
      diff={diff}
      isDirty={isDirty}
      route={route}
      toolbarRightContent={DATA_PERMISSIONS_TOOLBAR_CONTENT}
      helpContent={<DataPermissionsHelp />}
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
