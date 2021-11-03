import { connect } from "react-redux";
import Settings from "metabase/lib/settings";
import SyncDatabaseModal from "../../components/SyncDatabaseModal";

const mapStateToProps = () => ({
  xraysEnabled: Settings.get("enable-xrays"),
});

export default connect(mapStateToProps)(SyncDatabaseModal);
