import { connect } from "react-redux";
import _ from "underscore";
import { isDeprecatedEngine } from "metabase/lib/engine";
import Databases from "metabase/entities/databases";
import DriverDeprecationBanner from "../../components/DriverDeprecationBanner";
import { closeDeprecationNotice } from "../../database";
import { isDeprecationNoticeEnabled } from "../../selectors";

const mapStateToProps = (state, { databases = [] }) => ({
  database: databases.find(database => isDeprecatedEngine(database.engine)),
  isEnabled: isDeprecationNoticeEnabled(state),
});

const mapDispatchToProps = {
  onClose: closeDeprecationNotice,
};

export default _.compose(
  Databases.loadList({
    loadingAndErrorWrapper: false,
  }),
  connect(mapStateToProps, mapDispatchToProps),
)(DriverDeprecationBanner);
