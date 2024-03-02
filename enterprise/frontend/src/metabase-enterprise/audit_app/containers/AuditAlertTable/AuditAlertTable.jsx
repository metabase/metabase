import { connect } from "react-redux";
import { push } from "react-router-redux";
import { t } from "ttag";

import * as AlertCards from "../../lib/cards/alerts";
import { AuditEntitiesTable } from "../AuditEntitiesTable";

const mapStateToProps = (state, props) => ({
  table: AlertCards.table(),
  placeholder: t`Filter by question name`,
  getExtraDataForClick: () => ({ type: "alert" }),
  entities: state.entities.alerts,
});

const mapDispatchToProps = {
  onRemoveRow: ({ pulse_id }) =>
    push(`/admin/audit/subscriptions/alerts/${pulse_id}/delete`),
};

export default connect(mapStateToProps, mapDispatchToProps)(AuditEntitiesTable);
