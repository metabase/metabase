import { connect } from "react-redux";
import _ from "underscore";
import Alerts from "metabase/entities/alerts";
import { getUser } from "metabase/selectors/user";
import { getAlertId } from "../../selectors";
import ArchiveModal from "../../components/ArchiveModal";

const mapStateToProps = (state, { alert, location }) => ({
  item: alert,
  type: "alert",
  user: getUser(state),
  hasUnsubscribed: location.query.unsubscribed,
});

const mapDispatchToProps = {
  onArchive: Alerts.actions.setArchived,
};

export default _.compose(
  Alerts.load({
    id: (state, props) => getAlertId(props),
  }),
  connect(mapStateToProps, mapDispatchToProps),
)(ArchiveModal);
