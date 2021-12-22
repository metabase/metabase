import _ from "underscore";
import Databases from "metabase/entities/databases";
import DatabaseCandidates from "metabase/entities/database-candidates";
import SyncDatabaseModal from "../../components/SyncDatabaseModal";
import { getCandidatesQuery } from "../../selectors";

export default _.compose(
  Databases.loadList(),
  DatabaseCandidates.loadList({
    query: (state: any, props: any) => getCandidatesQuery(props.databases),
  }),
)(SyncDatabaseModal);
