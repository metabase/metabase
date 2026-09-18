import { t } from "ttag";

import { skipToken, useGetDatabaseQuery } from "metabase/api";
import { getDefaultEngineKey } from "metabase/databases/utils/engine";
import { RETURN_TO_SETUP_GUIDE_PARAM } from "metabase/embedding/constants";
import { PLUGIN_DB_ROUTING } from "metabase/plugins";
import { useNavigate } from "metabase/router";
import type { DatabaseId, Engine, EngineKey } from "metabase-types/api";

interface UseDatabaseConnectionProps {
  databaseId?: string;
  engines?: Record<EngineKey, Engine>;
}

export const useDatabaseConnection = ({
  databaseId,
  engines,
}: UseDatabaseConnectionProps) => {
  const navigate = useNavigate();
  const queryParams = new URLSearchParams(location.search);
  const preselectedEngine =
    queryParams.get("engine") ?? getDefaultEngineKey(engines || {});
  const returnToSetupGuide = queryParams.get(RETURN_TO_SETUP_GUIDE_PARAM);
  const addingNewDatabase = databaseId === undefined;

  const databaseReq = useGetDatabaseQuery(
    addingNewDatabase ? skipToken : { id: parseInt(databaseId, 10) },
  );

  const database = databaseReq.currentData ?? {
    id: undefined,
    is_attached_dwh: false,
    router_user_attribute: undefined,
    engine: preselectedEngine,
  };

  const handleCancel = () => {
    navigate(
      database?.id ? `/admin/databases/${database.id}` : `/admin/databases`,
    );
  };

  const handleOnSubmit = (savedDB: { id: DatabaseId }) => {
    if (addingNewDatabase) {
      // Carried through so the post-sync modal returns to whichever host
      // opened the guide, not always the default one.
      const param =
        returnToSetupGuide != null
          ? `?${RETURN_TO_SETUP_GUIDE_PARAM}=${encodeURIComponent(returnToSetupGuide)}`
          : "";
      navigate(`/admin/databases/${savedDB.id}${param}`);
    } else {
      handleCancel();
    }
  };

  const title = addingNewDatabase
    ? t`Add a database`
    : t`Edit connection details`;

  const config = {
    engine: {
      fieldState: database
        ? PLUGIN_DB_ROUTING.getPrimaryDBEngineFieldState(database)
        : "disabled",
    },
  };

  return {
    database,
    databaseReq,
    addingNewDatabase,
    handleCancel,
    handleOnSubmit,
    title,
    config,
  };
};
