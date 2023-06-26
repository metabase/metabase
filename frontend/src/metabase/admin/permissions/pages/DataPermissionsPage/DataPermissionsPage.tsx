import { useEffect, useCallback, ReactNode } from "react";
import _ from "underscore";
import { Route } from "react-router";

import Tables from "metabase/entities/tables";
import Groups from "metabase/entities/groups";
import Databases from "metabase/entities/databases";

import { DatabaseId, Group } from "metabase-types/api";
import { useDispatch, useSelector } from "metabase/lib/redux";
import Database from "metabase-lib/metadata/Database";
import { getIsDirty, getDiff } from "../../selectors/data-permissions/diff";
import {
  saveDataPermissions,
  loadDataPermissions,
  initializeDataPermissions,
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

  const loadPermissions = () => dispatch(loadDataPermissions());
  const savePermissions = () => dispatch(saveDataPermissions());
  const initialize = useCallback(
    () => dispatch(initializeDataPermissions()),
    [dispatch],
  );
  const fetchTables = useCallback(
    (dbId: DatabaseId) =>
      dispatch(
        Tables.actions.fetchList({
          dbId,
          include_hidden: true,
        }),
      ),
    [dispatch],
  );

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (params.databaseId == null) {
      return;
    }
    fetchTables(params.databaseId);
  }, [params.databaseId, fetchTables]);

  return (
    <PermissionsPageLayout
      tab="data"
      onLoad={loadPermissions}
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
