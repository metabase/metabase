import _ from "underscore";
import Settings from "metabase/lib/settings";
import { isSyncCompleted } from "metabase/lib/syncing";
import Databases from "metabase/entities/databases";
import DatabaseCandidates from "metabase/entities/database-candidates";
import SyncDatabaseModal from "../../components/SyncDatabaseModal";
import { Database } from "../../types";

const getCandidatesQuery = (databases: Database[] = []) => {
  const sampleDatabase = databases.find(d => d.is_sample);
  const hasSynced = isSyncCompleted(sampleDatabase);
  const hasXrays = Settings.enableXrays();

  if (sampleDatabase && hasSynced && hasXrays) {
    return { id: sampleDatabase.id };
  }
};

export default _.compose(
  Databases.loadList(),
  DatabaseCandidates.loadList({
    query: (state: any, props: any) => getCandidatesQuery(props.databases),
  }),
)(SyncDatabaseModal);
