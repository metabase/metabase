import { connect } from "react-redux";
import _ from "underscore";
import Alerts from "metabase/entities/alerts";
import { getUserId } from "metabase/selectors/user";
import UnsubscribeForm from "../components/UnsubscribeForm";

const mapStateToProps = (state, { alerts, params: { alertId } }) => ({
  item: _.findWhere(alerts, { id: alertId }),
  type: "alert",
});

export default _.compose(
  Alerts.loadList({
    query: state => ({ user_id: getUserId(state) }),
  }),
  connect(mapStateToProps),
)(UnsubscribeForm);
