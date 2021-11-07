import _ from "underscore";
import Databases from "metabase/entities/databases";
import { connect } from "react-redux";
import { getSampleDatabase, xraysEnabled } from "metabase/syncing/selectors";
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
