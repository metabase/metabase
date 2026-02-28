import { useEffect } from "react";

import { useDispatch } from "metabase/lib/redux";
import { replace } from "metabase/lib/router";
import * as Urls from "metabase-enterprise/urls";
import type { Database } from "metabase-types/api";

export function useRedirectDestinationDatabase(
  database: Pick<Database, "id" | "router_database_id"> | undefined,
) {
  const dispatch = useDispatch();

  useEffect(() => {
    if (database?.router_database_id) {
      dispatch(
        replace(
          Urls.editDestinationDatabase(
            database.router_database_id,
            database.id,
          ),
        ),
      );
    }
  }, [dispatch, database?.router_database_id, database?.id]);
}
