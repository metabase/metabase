import { connect } from "react-redux";
import { createSelector } from "@reduxjs/toolkit";
import _ from "underscore";
import Databases from "metabase/entities/databases";
import DatabaseCandidates from "metabase/entities/database-candidates";
import { getSetting } from "metabase/selectors/settings";
import { DatabaseCandidate } from "metabase-types/api";
import { State } from "metabase-types/store";
import Database from "metabase-lib/metadata/Database";
import DatabaseSyncModal from "../../components/DatabaseSyncModal";

interface DatabaseProps {
  databases: Database[];
}

interface CandidatesProps {
  databaseCandidates: DatabaseCandidate[];
}

const getSampleQuery = createSelector(
  (state: State, props: DatabaseProps) => props.databases,
  (state: State) => getSetting(state, "enable-xrays"),
  (databases, enableXrays) => {
    const sampleDatabase = databases.find(d => d.is_sample);

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
)(DatabaseSyncModal);
