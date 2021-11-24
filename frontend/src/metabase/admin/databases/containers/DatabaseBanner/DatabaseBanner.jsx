import { connect } from "react-redux";
import _ from "underscore";
import Databases from "metabase/entities/databases";
import { closeDatabaseBanner } from "../../database";
import DatabaseBanner from "../../components/DatabaseBanner";
import {
  getDeprecatedDatabase,
  isDeprecationBannerEnabled,
} from "../../selectors";

const mapStateToProps = state => ({
  database: getDeprecatedDatabase(state),
  isEnabled: isDeprecationBannerEnabled(state),
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
