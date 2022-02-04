import { connect } from "react-redux";
import { createSelector } from "reselect";
import _ from "underscore";
import Settings from "metabase/lib/settings";
import Databases from "metabase/entities/databases";
import DatabaseCandidates from "metabase/entities/database-candidates";
import SyncingModal from "metabase/components/SyncingModal";
import { Database, DatabaseCandidate } from "metabase-types/api";

interface DatabaseProps {
  databases: Database[];
}

interface CandidatesProps {
  databaseCandidates: DatabaseCandidate[];
}

const getSampleQuery = createSelector(
  (state: unknown, props: DatabaseProps) => props.databases,
  databases => {
    const sampleDatabase = databases.find(d => d.is_sample);
    const enableXrays = Settings.get("enable-xrays");

    if (sampleDatabase && enableXrays) {
      return { id: sampleDatabase.id };
    }
  },
);

const getSampleUrl = createSelector(
  (state: unknown, props: CandidatesProps) => props.databaseCandidates,
  candidates => {
    const tables = candidates.flatMap(d => d.tables);
    const table = tables.find(t => t.title.includes("Orders")) ?? tables[0];
    return table?.url;
  },
);

const mapStateToProps = (state: unknown, props: CandidatesProps) => ({
  sampleUrl: getSampleUrl(state, props),
});

export default _.compose(
  Databases.loadList(),
  DatabaseCandidates.loadList({ query: getSampleQuery }),
  connect(mapStateToProps),
)(SyncingModal);
