import { connect } from "react-redux";
import { push } from "react-router-redux";
import { t } from "ttag";
import * as SubscriptionCards from "../lib/cards/subscriptions";
import AuditTableWithSearch from "./AuditTableWithSearch";

const mapStateToProps = () => ({
  table: SubscriptionCards.pulses(),
  placeholder: t`Filter by dashboard name`,
});

const mapDispatchToProps = {
  onRemoveRow: ({ id }) => push(`/audit/subscriptions/${id}/delete`),
};

export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(AuditTableWithSearch);
