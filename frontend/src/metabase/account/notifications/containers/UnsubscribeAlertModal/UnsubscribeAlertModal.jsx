import { connect } from "react-redux";
import _ from "underscore";
import Alerts from "metabase/entities/alerts";
import { getUser } from "metabase/selectors/user";
import { navigateToArchive } from "../../actions";
import { getAlertId } from "../../selectors";
import UnsubscribeModal from "../../components/UnsubscribeModal";

const mapStateToProps = (state, { alert }) => ({
  item: alert,
  type: "alert",
  user: getUser(state),
});

const mapDispatchToProps = {
  onUnsubscribe: Alerts.actions.unsubscribe,
  onArchive: navigateToArchive,
};

export default _.compose(
  Alerts.load({
    id: (state, props) => getAlertId(props),
  }),
  connect(mapStateToProps, mapDispatchToProps),
)(UnsubscribeModal);
