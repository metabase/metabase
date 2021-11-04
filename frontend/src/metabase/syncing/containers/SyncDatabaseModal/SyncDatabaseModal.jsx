import { connect } from "react-redux";
import _ from "underscore";
import Settings from "metabase/lib/settings";
import SyncDatabaseModal from "../../components/SyncDatabaseModal";
import Databases from "metabase/entities/databases";

const mapStateToProps = (state, { databases }) => ({
  sampleDatabase: databases.find(d => d.is_sample),
  xraysEnabled: Settings.get("enable-xrays"),
});

export default _.compose(
  Databases.loadList(),
  connect(mapStateToProps),
)(SyncDatabaseModal);
