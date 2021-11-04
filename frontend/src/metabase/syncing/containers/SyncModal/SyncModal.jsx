import { connect } from "react-redux";
import _ from "underscore";
import Settings from "metabase/lib/settings";
import Databases from "metabase/entities/databases";
import SyncModal from "../../components/SyncModal";
import { getSampleDatabase } from "../../selectors";

const listOptions = {
  query: { include: "tables" },
};

const mapStateToProps = state => ({
  sampleDatabase: getSampleDatabase(state),
  xraysEnabled: Settings.get("enable-xrays"),
});

export default _.compose(
  Databases.loadList(listOptions),
  connect(mapStateToProps),
)(SyncModal);
