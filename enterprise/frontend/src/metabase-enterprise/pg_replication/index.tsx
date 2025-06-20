import { PLUGIN_DATA_REPLICATION } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { DatabaseDataReplicationSection } from "./DatabaseDataReplicationSection";

if (
  hasPremiumFeature("hosting") &&
  hasPremiumFeature("attached_dwh") &&
  hasPremiumFeature("etl_connections") &&
  hasPremiumFeature("etl_connections_pg")
) {
  PLUGIN_DATA_REPLICATION.DatabaseDataReplicationSection =
    DatabaseDataReplicationSection;
}
