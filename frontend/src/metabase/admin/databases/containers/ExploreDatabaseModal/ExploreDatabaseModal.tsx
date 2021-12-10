import { connect } from "react-redux";
import _ from "underscore";
import Settings from "metabase/lib/settings";
import Databases from "metabase/entities/databases";
import { Database } from "../../types";
import ExploreDatabaseModal from "../../components/ExploreDatabaseModal";

interface Props {
  databases: Database[];
}

const mapStateToProps = (state: any, { databases }: Props) => ({
  sampleDatabase: databases.find(d => d.is_sample),
  showXrays: Settings.get("enable-xrays"),
});

export default _.compose(
  Databases.loadList(),
  connect(mapStateToProps),
)(ExploreDatabaseModal);
