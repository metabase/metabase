import { connect } from "react-redux";
import _ from "underscore";
import Databases from "metabase/entities/databases";
import SyncModalSwitch from "../../components/SyncModalSwitch";
import { hasSyncingDatabases, isSyncingModalEnabled } from "../../selectors";
import { disableSyncingModal } from "metabase/syncing/actions";

export default _.compose(
  Databases.loadList({
    query: { include: "tables" },
  }),
  connect(
    state => ({
      isSyncing: hasSyncingDatabases(state),
      isOnboarding: isSyncingModalEnabled(state),
    }),
    {
      onOpen: disableSyncingModal,
    },
  ),
)(SyncModalSwitch);
