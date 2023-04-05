import { connect } from "react-redux";
import _ from "underscore";
import { getUserIsAdmin } from "metabase/selectors/user";
import { State } from "metabase-types/store";
import { getSetting } from "metabase/selectors/settings";
import Databases from "metabase/entities/databases";
import StatusListing from "../../components/StatusListing";

const mapStateToProps = (state: State) => ({
  isAdmin: getUserIsAdmin(state),
});

export default _.compose(
  Databases.load({
    id: (state: State) => getSetting(state, "uploads-database-id"),
  }),
  connect(mapStateToProps),
)(StatusListing);
