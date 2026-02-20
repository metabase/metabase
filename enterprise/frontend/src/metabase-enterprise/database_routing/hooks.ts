import { useEffect } from "react";

import { useNavigation } from "metabase/routing/compat";
import * as Urls from "metabase-enterprise/urls";
import type { Database } from "metabase-types/api";

export function useRedirectDestinationDatabase(
  database: Pick<Database, "id" | "router_database_id"> | undefined,
) {
  const { replace } = useNavigation();

  useEffect(() => {
    if (database?.router_database_id) {
      replace(
        Urls.editDestinationDatabase(database.router_database_id, database.id),
      );
    }
  }, [database?.router_database_id, database?.id, replace]);
}
