import { connect } from "react-redux";
import _ from "underscore";
import Databases from "metabase/entities/databases";
import { getSampleDatabase, xraysEnabled } from "../../selectors";
import SyncModalContent from "../../components/SyncModalContent";

export default _.compose(
  Databases.loadList({
    query: { include: "tables" },
  }),
  connect(state => ({
    sampleDatabase: getSampleDatabase(state),
    xraysEnabled: xraysEnabled(state),
  })),
)(SyncModalContent);
