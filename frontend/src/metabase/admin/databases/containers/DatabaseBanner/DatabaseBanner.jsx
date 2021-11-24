import { connect } from "react-redux";
import _ from "underscore";
import Settings from "metabase/lib/settings";
import { isDeprecatedEngine } from "metabase/lib/engine";
import Databases from "metabase/entities/databases";
import { closeDatabaseBanner } from "../../database";
import DatabaseBanner from "../../components/DatabaseBanner";

const mapStateToProps = (state, { databases = [] }) => ({
  database: databases.find(database => isDeprecatedEngine(database.engine)),
  isEnabled: Settings.get("engine-deprecation-notice-enabled"),
});

const mapDispatchToProps = {
  onClose: closeDatabaseBanner,
};

export default _.compose(
  Databases.loadList({
    loadingAndErrorWrapper: false,
  }),
  connect(
    mapStateToProps,
    mapDispatchToProps,
  ),
)(DatabaseBanner);
