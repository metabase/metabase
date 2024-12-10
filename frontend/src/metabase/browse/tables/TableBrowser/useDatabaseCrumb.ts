import { t } from "ttag";

import { skipToken, useGetDatabaseQuery } from "metabase/api";
import * as Urls from "metabase/lib/urls";
import { SAVED_QUESTIONS_VIRTUAL_DB_ID } from "metabase-lib/v1/metadata/utils/saved-questions";
import type { DatabaseId } from "metabase-types/api";

export const useDatabaseCrumb = (id: DatabaseId) => {
  const { data: database } = useGetDatabaseQuery(
    id === SAVED_QUESTIONS_VIRTUAL_DB_ID ? skipToken : { id },
  );

  if (id === SAVED_QUESTIONS_VIRTUAL_DB_ID) {
    return {
      title: t`Saved Questions`,
      to: Urls.browseDatabase({ id: SAVED_QUESTIONS_VIRTUAL_DB_ID }),
    };
  }

  if (!database) {
    return null;
  }

  return {
    title: database.name,
    to: Urls.browseDatabase(database),
  };
};
