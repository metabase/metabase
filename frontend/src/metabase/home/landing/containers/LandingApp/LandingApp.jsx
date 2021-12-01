import { connect } from "react-redux";
import _ from "underscore";
import Databases from "metabase/entities/databases";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import DatabaseCandidates from "metabase/entities/database-candidates";
import Search from "metabase/entities/search";
import { getUserIsAdmin } from "metabase/selectors/user";
import LandingApp from "../../components/LandingApp";
import { getGreeting } from "../../selectors";

const dashboardsProps = {
  query: {
    collection: ROOT_COLLECTION.id,
    pinned_state: "is_pinned",
    sort_column: "name",
    sort_direction: "asc",
    models: "dashboard",
    limit: 500,
  },
  listName: "dashboards",
};

const candidatesProps = {
  query: {
    id: 1,
  },
  listName: "candidates",
};

const mapStateToProps = state => ({
  greeting: getGreeting(state),
  isAdmin: getUserIsAdmin(state),
  showXrays: true,
  showOurData: true,
});

export default _.compose(
  Databases.loadList(),
  DatabaseCandidates.loadList(candidatesProps),
  Search.loadList(dashboardsProps),
  connect(mapStateToProps),
)(LandingApp);
