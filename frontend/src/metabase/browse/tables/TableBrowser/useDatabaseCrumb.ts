import { t } from "ttag";

import { skipToken, useGetDatabaseQuery } from "metabase/api";
import { Databases } from "metabase/entities/databases";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { SAVED_QUESTIONS_VIRTUAL_DB_ID } from "metabase-lib/v1/metadata/utils/saved-questions";
import type { DatabaseId } from "metabase-types/api";

export const useDatabaseCrumb = (id: DatabaseId) => {
  // We display what we already have in store to avoid showing loading state.
  // It's possible because GET /api/database is always dispatched on app launch.
  // We still re-fetch the database to get new data, just in case it changed.
  const legacyDatabase = useSelector((state) => {
    return Databases.selectors.getObject(state, {
      entityId: id,
      requestType: "fetch",
    });
  });

  const { data: fetchedDatabase } = useGetDatabaseQuery(
    id === SAVED_QUESTIONS_VIRTUAL_DB_ID ? skipToken : { id },
  );

  if (id === SAVED_QUESTIONS_VIRTUAL_DB_ID) {
    return {
      title: t`Saved Questions`,
      to: Urls.browseDatabase({ id: SAVED_QUESTIONS_VIRTUAL_DB_ID }),
    };
  }

  const database = fetchedDatabase ?? legacyDatabase;

  if (!database) {
    return {
      title: null,
      to: Urls.browseDatabase({ id }),
    };
  }

  return {
    title: database.name,
    to: Urls.browseDatabase(database),
  };
};
