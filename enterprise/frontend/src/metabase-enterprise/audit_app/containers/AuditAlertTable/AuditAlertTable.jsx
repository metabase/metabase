import { connect } from "react-redux";
import { push } from "react-router-redux";
import { t } from "ttag";
import * as AlertCards from "../../lib/cards/alerts";
import AuditTableWithSearch from "../AuditTableWithSearch";

const mapStateToProps = (state, props) => ({
  table: AlertCards.table(),
  placeholder: t`Filter by question name`,
  reload: props.location.state,
});

const mapDispatchToProps = {
  onRemoveRow: ({ id }) =>
    push(`/admin/audit/subscriptions/alerts/${id}/delete`),
};

export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(AuditTableWithSearch);
