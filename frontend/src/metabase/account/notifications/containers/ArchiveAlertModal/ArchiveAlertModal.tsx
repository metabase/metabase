import { connect } from "react-redux";
import _ from "underscore";
import type { Location } from "history";

import Alerts from "metabase/entities/alerts";
import { getUser } from "metabase/selectors/user";

import ArchiveModal from "../../components/ArchiveModal";
import { getAlertId } from "../../selectors";
import { State } from "metabase-types/store";
import { Alert } from "metabase-types/api";

const mapStateToProps = (
  state: State,
  { alert, location }: { alert: Alert; location: Location },
) => ({
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
    id: (_state: State, props: { params: { alertId: string } }) =>
      getAlertId(props),
  }),
  connect(mapStateToProps, mapDispatchToProps),
)(ArchiveModal);
