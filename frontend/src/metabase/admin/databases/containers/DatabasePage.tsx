import type { Route } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";

import { skipToken, useGetDatabaseQuery } from "metabase/api";
import { useDispatch } from "metabase/lib/redux";
import { PLUGIN_DB_ROUTING } from "metabase/plugins";
import { Box, Title } from "metabase/ui";
import type { DatabaseId } from "metabase-types/api";

import { DatabaseEditConnectionForm } from "../components/DatabaseEditConnectionForm";

interface DatabasePageProps {
  params: { databaseId: string };
  route: Route;
}

export function DatabasePage({ params, route }: DatabasePageProps) {
  const dispatch = useDispatch();
  const queryParams = new URLSearchParams(location.search);
  const preselectedEngine = queryParams.get("engine") ?? undefined;
  const addingNewDatabase = params.databaseId === undefined;
  const databaseReq = useGetDatabaseQuery(
    addingNewDatabase ? skipToken : { id: parseInt(params.databaseId, 10) },
  );
  const database = databaseReq.currentData ?? {
    id: undefined,
    is_attached_dwh: false,
    router_user_attribute: undefined,
    engine: preselectedEngine,
  };

  const handleCloseModal = () => {
    dispatch(
      database?.id
        ? push(`/admin/databases/${database.id}`)
        : push(`/admin/databases`),
    );
  };

  const handleOnSubmit = (savedDB: { id: DatabaseId }) => {
    if (addingNewDatabase) {
      dispatch(push(`/admin/databases/${savedDB.id}`));
    } else {
      handleCloseModal();
    }
  };

  return (
    <Box w="100%" maw="54rem" mx="auto" p="xl">
      <Title order={1} mb="lg">{t`Add database`}</Title>
      <DatabaseEditConnectionForm
        database={database}
        isAttachedDWH={database?.is_attached_dwh ?? false}
        initializeError={databaseReq.error}
        onSubmitted={handleOnSubmit}
        route={route}
        onCancel={handleCloseModal}
        config={{
          engine: {
            fieldState: database
              ? PLUGIN_DB_ROUTING.getPrimaryDBEngineFieldState(database)
              : "disabled",
          },
        }}
        formLocation="full-page"
      />
    </Box>
  );
}
