import { connect } from "react-redux";
import _ from "underscore";
import Databases from "metabase/entities/databases";
import { disableSyncingModal } from "../../actions";
import { isSyncingModalRequired } from "../../selectors";
import SyncModal from "../../components/SyncModal";

export default _.compose(
  Databases.loadList({
    query: { include: "tables" },
    loadingAndErrorWrapper: false,
  }),
  connect(
    state => ({
      isRequired: isSyncingModalRequired(state),
    }),
    {
      onOpen: disableSyncingModal,
    },
  ),
)(SyncModal);
