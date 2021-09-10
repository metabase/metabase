import { connect } from "react-redux";
import { push } from "react-router-redux";
import { t } from "ttag";
import * as SubscriptionCards from "../../lib/cards/subscriptions";
import AuditTableWithSearch from "../AuditTableWithSearch";

const mapStateToProps = () => ({
  table: SubscriptionCards.table(),
  placeholder: t`Filter by dashboard name`,
});

const mapDispatchToProps = {
  onVisualizationClick: ({ id }) =>
    push(`/admin/audit/subscriptions/subscriptions/${id}/edit`),
  onRemoveRow: ({ id }) =>
    push(`/admin/audit/subscriptions/subscriptions/${id}/delete`),
};

export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(AuditTableWithSearch);
