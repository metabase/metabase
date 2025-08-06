import { PLUGIN_DATABASE_REPLICATION } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { DatabaseReplicationSection } from "./DatabaseReplicationSection";

if (
  hasPremiumFeature("hosting") &&
  hasPremiumFeature("attached_dwh") &&
  hasPremiumFeature("etl_connections") &&
  hasPremiumFeature("etl_connections_pg")
) {
  PLUGIN_DATABASE_REPLICATION.DatabaseReplicationSection =
    DatabaseReplicationSection;
}
