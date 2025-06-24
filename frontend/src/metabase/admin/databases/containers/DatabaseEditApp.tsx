import type { Location } from "history";
import { type ComponentType, useEffect, useState } from "react";
import { withRouter } from "react-router";
import { replace } from "react-router-redux";
import { useMount } from "react-use";
import { t } from "ttag";
import _ from "underscore";

import ErrorBoundary from "metabase/ErrorBoundary";
import { useGetDatabaseQuery } from "metabase/api";
import { useSetting } from "metabase/common/hooks";
import Breadcrumbs from "metabase/components/Breadcrumbs";
import { GenericError } from "metabase/components/ErrorPages";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import CS from "metabase/css/core/index.css";
import title from "metabase/hoc/Title";
import { connect, useDispatch, useSelector } from "metabase/lib/redux";
import { PLUGIN_DB_ROUTING } from "metabase/plugins";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Box, Divider, Flex } from "metabase/ui";
import type {
  DatabaseData,
  DatabaseId,
  Database as DatabaseType,
} from "metabase-types/api";

import { DatabaseConnectionInfoSection } from "../components/DatabaseConnectionInfoSection";
import { DatabaseDangerZoneSection } from "../components/DatabaseDangerZoneSection";
import { DatabaseModelFeaturesSection } from "../components/DatabaseModelFeaturesSection";
import { ExistingDatabaseHeader } from "../components/ExistingDatabaseHeader";
import { NewDatabasePermissionsModal } from "../components/NewDatabasePermissionsModal";
import { deleteDatabase, updateDatabase } from "../database";

interface DatabaseEditAppProps {
  children: React.ReactNode;
  params: { databaseId: string };
  updateDatabase: (
    database: { id: DatabaseId } & Partial<DatabaseType>,
  ) => Promise<void>;
  deleteDatabase: (databaseId: DatabaseId) => Promise<void>;
  location: Location;
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
  location,
}: DatabaseEditAppProps) {
  const dispatch = useDispatch();
  const isAdmin = useSelector(getUserIsAdmin);
  const isModelPersistenceEnabled = useSetting("persisted-models-enabled");

  const databaseId = parseInt(params.databaseId, 10);

  const [pollingInterval, setPollingInterval] = useState<number>();
  const {
    currentData: database,
    isLoading,
    error,
  } = useGetDatabaseQuery({ id: databaseId }, { pollingInterval });

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

  const [isPermissionModalOpened, setIsPermissionModalOpened] = useState(false);
  useMount(() => {
    if (location.query.created) {
      setIsPermissionModalOpened(true);
      dispatch(replace(location.pathname));
    }
  });
  const onPermissionModalClose = () => setIsPermissionModalOpened(false);

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

                  <DatabaseModelFeaturesSection
                    database={database}
                    isModelPersistenceEnabled={isModelPersistenceEnabled}
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

                <NewDatabasePermissionsModal
                  opened={isPermissionModalOpened}
                  onClose={onPermissionModalClose}
                  database={database}
                />
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
  title(
    ({ database }: { database: DatabaseData }) => database && database.name,
  ),
)(DatabaseEditAppInner);
