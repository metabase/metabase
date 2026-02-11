import { type ComponentType, useEffect, useState } from "react";
import { withRouter } from "react-router";
import { t } from "ttag";
import _ from "underscore";

import ErrorBoundary from "metabase/ErrorBoundary";
import {
  useGetDatabaseQuery,
  useGetDatabaseSettingsAvailableQuery,
} from "metabase/api";
import { Breadcrumbs } from "metabase/common/components/Breadcrumbs";
import { GenericError } from "metabase/common/components/ErrorPages";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useSetting } from "metabase/common/hooks";
import CS from "metabase/css/core/index.css";
import { usePageTitle } from "metabase/hooks/use-page-title";
import { connect, useSelector } from "metabase/lib/redux";
import {
  PLUGIN_ADVANCED_PERMISSIONS,
  PLUGIN_DATABASE_REPLICATION,
  PLUGIN_DB_ROUTING,
  PLUGIN_TABLE_EDITING,
  PLUGIN_WORKSPACES,
} from "metabase/plugins";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Box, Divider, Flex } from "metabase/ui";
import type { DatabaseId, Database as DatabaseType } from "metabase-types/api";

import { DatabaseConnectionInfoSection } from "../components/DatabaseConnectionInfoSection";
import { DatabaseDangerZoneSection } from "../components/DatabaseDangerZoneSection";
import { DatabaseModelFeaturesSection } from "../components/DatabaseModelFeaturesSection";
import { ExistingDatabaseHeader } from "../components/ExistingDatabaseHeader";
import { deleteDatabase, updateDatabase } from "../database";

interface DatabaseEditAppProps {
  children: React.ReactNode;
  params: { databaseId: string };
  updateDatabase: (
    database: { id: DatabaseId } & Partial<DatabaseType>,
  ) => Promise<void>;
  deleteDatabase: (databaseId: DatabaseId) => Promise<void>;
}

const mapDispatchToProps = {
  updateDatabase,
  deleteDatabase,
};

function DatabaseEditAppInner({
  children,
  params,
  updateDatabase,
  deleteDatabase,
}: DatabaseEditAppProps) {
  const isAdmin = useSelector(getUserIsAdmin);
  const isModelPersistenceEnabled = useSetting("persisted-models-enabled");

  const databaseId = parseInt(params.databaseId, 10);

  const [pollingInterval, setPollingInterval] = useState<number>();
  const {
    currentData: database,
    isLoading,
    error,
  } = useGetDatabaseQuery({ id: databaseId }, { pollingInterval });

  const { data: settingsAvailable } =
    useGetDatabaseSettingsAvailableQuery(databaseId);

  useEffect(
    function pollDatabaseWhileSyncing() {
      const isSyncing = database?.initial_sync_status === "incomplete";
      setPollingInterval(isSyncing ? 2000 : undefined);
    },
    [database?.initial_sync_status],
  );

  const crumbs = _.compact([
    [t`Databases`, "/admin/databases"],
    database?.name && [database?.name],
  ]);

  usePageTitle(database?.name || "");

  PLUGIN_DB_ROUTING.useRedirectDestinationDatabase(database);

  return (
    <>
      <ErrorBoundary errorComponent={GenericError as ComponentType}>
        <Box w="100%" maw="64.25rem" mx="auto" px="2rem">
          <Breadcrumbs className={CS.py4} crumbs={crumbs} />

          <LoadingAndErrorWrapper loading={isLoading} error={error}>
            {database && (
              <>
                <ExistingDatabaseHeader database={database} />

                <Divider mb={{ base: "1.5rem", sm: "3.25rem" }} />

                <Flex
                  direction="column"
                  gap={{ base: "2rem", sm: "5.5rem" }}
                  mb={{ base: "3rem", sm: "5.5rem" }}
                >
                  <DatabaseConnectionInfoSection database={database} />

                  <PLUGIN_ADVANCED_PERMISSIONS.WriteDataConnectionSection
                    database={database}
                  />

                  <DatabaseModelFeaturesSection
                    database={database}
                    isModelPersistenceEnabled={isModelPersistenceEnabled}
                    updateDatabase={updateDatabase}
                  />

                  <PLUGIN_DATABASE_REPLICATION.DatabaseReplicationSection
                    database={database}
                  />

                  <PLUGIN_TABLE_EDITING.AdminDatabaseTableEditingSection
                    database={database}
                    settingsAvailable={settingsAvailable?.settings}
                    updateDatabase={updateDatabase}
                  />

                  <PLUGIN_WORKSPACES.AdminDatabaseWorkspacesSection
                    database={database}
                    settingsAvailable={settingsAvailable?.settings}
                    updateDatabase={updateDatabase}
                  />

                  <PLUGIN_DB_ROUTING.DatabaseRoutingSection
                    database={database}
                  />

                  <DatabaseDangerZoneSection
                    isAdmin={isAdmin}
                    database={database}
                    deleteDatabase={deleteDatabase}
                  />
                </Flex>
              </>
            )}
          </LoadingAndErrorWrapper>
        </Box>
      </ErrorBoundary>
      {children}
    </>
  );
}

export const DatabaseEditApp = _.compose(
  withRouter,
  connect(undefined, mapDispatchToProps),
)(DatabaseEditAppInner);
