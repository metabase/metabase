import { connect } from "react-redux";
import { push } from "react-router-redux";
import { t } from "ttag";

import * as SubscriptionCards from "../../lib/cards/subscriptions";
import { AuditEntitiesTable } from "../AuditEntitiesTable";

const mapStateToProps = (state, props) => ({
  table: SubscriptionCards.table(),
  placeholder: t`Filter by dashboard name`,
  getExtraDataForClick: () => ({ type: "subscription" }),
  entities: state.entities.pulses,
});

const mapDispatchToProps = {
  onRemoveRow: ({ pulse_id }) =>
    push(`/admin/audit/subscriptions/subscriptions/${pulse_id}/delete`),
};

export default connect(mapStateToProps, mapDispatchToProps)(AuditEntitiesTable);
