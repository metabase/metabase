import { connect } from "react-redux";
import _ from "underscore";
import Databases from "metabase/entities/databases";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import DatabaseCandidates from "metabase/entities/database-candidates";
import Search from "metabase/entities/search";
import { getUser } from "metabase/selectors/user";
import LandingApp from "../../components/LandingApp";

const databasesProps = {
  loadingAndErrorWrapper: false,
};

const collectionsProps = {
  query: {
    collection: ROOT_COLLECTION.id,
    models: "collection",
    limit: 500,
  },
  listName: "collections",
  loadingAndErrorWrapper: false,
};

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
  loadingAndErrorWrapper: false,
};

const candidatesProps = {
  query: {
    id: 1,
  },
  listName: "candidates",
  loadingAndErrorWrapper: false,
};

const mapStateToProps = state => ({
  user: getUser(state),
  showXrays: true,
  showOurData: true,
  showPinNotice: true,
});

export default _.compose(
  Databases.loadList(databasesProps),
  Search.loadList(collectionsProps),
  Search.loadList(dashboardsProps),
  DatabaseCandidates.loadList(candidatesProps),
  connect(mapStateToProps),
)(LandingApp);
