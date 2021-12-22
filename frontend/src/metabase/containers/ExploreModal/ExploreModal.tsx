import { connect } from "react-redux";
import { createSelector } from "reselect";
import _ from "underscore";
import Settings from "metabase/lib/settings";
import Databases from "metabase/entities/databases";
import DatabaseCandidates from "metabase/entities/database-candidates";
import ExploreModal from "metabase/components/ExploreModal";
import { Database, DatabaseCandidate } from "./types";

interface WithDatabases {
  databases: Database[];
}

interface WithDatabaseCandidates {
  databaseCandidates: DatabaseCandidate[];
}

const getSampleQuery = createSelector(
  (state: unknown, props: WithDatabases) => props.databases,
  databases => {
    const sampleDatabase = databases.find(d => d.is_sample);
    const enableXrays = Settings.get("enable-xrays");

    if (sampleDatabase && enableXrays) {
      return { id: sampleDatabase.id };
    }
  },
);

const getSampleUrl = createSelector(
  (state: unknown, props: WithDatabaseCandidates) => props.databaseCandidates,
  candidates => {
    const tables = candidates.flatMap(d => d.tables);
    const table = tables.find(t => t.title.includes("Orders")) ?? tables[0];
    return table?.url;
  },
);

const mapStateToProps = (state: unknown, props: WithDatabaseCandidates) => ({
  sampleUrl: getSampleUrl(state, props),
});

export default _.compose(
  Databases.loadList(),
  DatabaseCandidates.loadList({ query: getSampleQuery }),
  connect(mapStateToProps),
)(ExploreModal);
