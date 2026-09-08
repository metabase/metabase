import { useEffect } from "react";

import * as Urls from "metabase-enterprise/urls";
import type { Database } from "metabase-types/api";
import { useNavigate } from "metabase/router";

export function useRedirectDestinationDatabase(
  database: Pick<Database, "id" | "router_database_id"> | undefined,
) {
  const navigate = useNavigate();

  useEffect(() => {
    if (database?.router_database_id) {
      navigate(
        Urls.editDestinationDatabase(database.router_database_id, database.id),
        { replace: true },
      );
    }
  }, [database?.router_database_id, database?.id, navigate]);
}
