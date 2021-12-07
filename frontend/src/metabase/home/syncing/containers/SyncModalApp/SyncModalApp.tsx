import { connect } from "react-redux";
import _ from "underscore";
import Databases from "metabase/entities/databases";
import { hideSyncingModal } from "../../actions";
import { showModal, hasSyncingDatabases } from "../../selectors";
import SyncModal from "../../components/SyncModal";

export default _.compose(
  Databases.loadList({
    query: { include: "tables" },
    loadingAndErrorWrapper: false,
  }),
  connect(
    state => ({
      showModal: showModal(state),
      hasSyncingDatabases: hasSyncingDatabases(state),
    }),
    {
      onHideModal: hideSyncingModal,
    },
  ),
)(SyncModal);
