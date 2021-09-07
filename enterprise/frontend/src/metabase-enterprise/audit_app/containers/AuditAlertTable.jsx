import { connect } from "react-redux";
import { push } from "react-router-redux";
import { t } from "ttag";
import * as AlertCards from "../lib/cards/alerts";
import AuditTableWithSearch from "./AuditTableWithSearch";

const mapStateToProps = () => ({
  table: AlertCards.alerts(),
  placeholder: t`Filter by question name`,
});

const mapDispatchToProps = {
  onRemoveRow: ({ id }) => push(`/audit/alerts/${id}/delete`),
};

export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(AuditTableWithSearch);
