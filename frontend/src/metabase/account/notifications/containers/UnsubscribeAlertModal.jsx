import { connect } from "react-redux";
import _ from "underscore";
import Alerts from "metabase/entities/alerts";
import { getUserId } from "metabase/selectors/user";
import { getAlert } from "../selectors";
import UnsubscribeNotificationModal from "../components/UnsubscribeNotificationModal";

const mapStateToProps = (state, props) => ({
  item: getAlert(props),
  type: "alert",
});

const mapDispatchToProps = {
  onUnsubscribe: Alerts.actions.unsubscribe,
};

export default _.compose(
  Alerts.loadList({
    query: state => ({ user_id: getUserId(state) }),
  }),
  connect(
    mapStateToProps,
    mapDispatchToProps,
  ),
)(UnsubscribeNotificationModal);
