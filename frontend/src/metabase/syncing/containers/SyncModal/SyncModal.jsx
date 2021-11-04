import { connect } from "react-redux";
import _ from "underscore";
import Databases from "metabase/entities/databases";
import { getXraysEnabled } from "metabase/selectors/settings";
import SyncModal from "../../components/SyncModal";
import { getSampleDatabase } from "../../selectors";

export default _.compose(
  Databases.loadList({
    query: { include: "tables" },
  }),
  connect(state => ({
    sampleDatabase: getSampleDatabase(state),
    xraysEnabled: getXraysEnabled(state),
  })),
)(SyncModal);
