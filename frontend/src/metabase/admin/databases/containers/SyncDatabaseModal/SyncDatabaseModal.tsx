import _ from "underscore";
import Settings from "metabase/lib/settings";
import Databases from "metabase/entities/databases";
import DatabaseCandidates from "metabase/entities/database-candidates";
import SyncDatabaseModal from "../../components/SyncDatabaseModal";
import { Database } from "../../types";

const getCandidatesQuery = (databases: Database[]) => {
  const sampleDatabase = databases.find(d => d.is_sample);
  const enableXrays = Settings.get("enable-xrays");

  if (sampleDatabase && enableXrays) {
    return { id: sampleDatabase.id };
  }
};

export default _.compose(
  Databases.loadList(),
  DatabaseCandidates.loadList({
    query: (state: any, props: any) => getCandidatesQuery(props.databases),
  }),
)(SyncDatabaseModal);
