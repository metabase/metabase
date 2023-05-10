import { connect } from "react-redux";
import _ from "underscore";
import Databases from "metabase/entities/databases";
import DatabaseCandidates from "metabase/entities/database-candidates";
import { isSyncCompleted } from "metabase/lib/syncing";
import { State } from "metabase-types/store";
import Database from "metabase-lib/metadata/Database";
import HomeXraySection from "../../components/HomeXraySection";

interface XraySectionProps {
  database?: Database;
  databases: Database[];
}

const getXrayDatabase = ({ databases }: XraySectionProps) => {
  const sampleDatabase = databases.find(d => d.is_sample && isSyncCompleted(d));
  const userDatabase = databases.find(d => !d.is_sample && isSyncCompleted(d));
  return userDatabase ?? sampleDatabase;
};

const getXrayQuery = (state: State, { database }: XraySectionProps) => ({
  id: database?.id,
});

const mapStateToProps = (state: State, props: XraySectionProps) => ({
  database: getXrayDatabase(props),
});

export default _.compose(
  Databases.loadList(),
  connect(mapStateToProps),
  DatabaseCandidates.loadList({ query: getXrayQuery, listName: "candidates" }),
)(HomeXraySection);
