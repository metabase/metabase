import { connect } from "react-redux";
import _ from "underscore";
import Databases from "metabase/entities/databases";
import DatabaseCandidates from "metabase/entities/database-candidates";
import { getUserIsAdmin } from "metabase/selectors/user";
import LandingApp from "../../components/LandingApp";
import { getGreeting } from "../../selectors";

const mapStateToProps = state => ({
  greeting: getGreeting(state),
  isAdmin: getUserIsAdmin(state),
  showXrays: true,
  showOurData: true,
});

export default _.compose(
  Databases.loadList(),
  DatabaseCandidates.loadList({ query: { id: 1 } }),
  connect(mapStateToProps),
)(LandingApp);
