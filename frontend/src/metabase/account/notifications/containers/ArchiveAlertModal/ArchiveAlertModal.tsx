import type { Location } from "history";
import { connect } from "react-redux";
import _ from "underscore";

import Alerts from "metabase/entities/alerts";
import { getUser } from "metabase/selectors/user";
import type { Alert } from "metabase-types/api";
import type { State } from "metabase-types/store";

import ArchiveModal from "../../components/ArchiveModal";
import { getAlertId } from "../../selectors";

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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Alerts.load({
    id: (_state: State, props: { params: { alertId: string } }) =>
      getAlertId(props),
  }),
  connect(mapStateToProps, mapDispatchToProps),
)(ArchiveModal);
