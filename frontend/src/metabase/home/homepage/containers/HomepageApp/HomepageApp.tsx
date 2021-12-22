import { connect } from "react-redux";
import _ from "underscore";
import Databases from "metabase/entities/databases";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import DatabaseCandidates from "metabase/entities/database-candidates";
import Search from "metabase/entities/search";
import { getUser } from "metabase/selectors/user";
import Homepage from "../../components/Homepage";
import {
  hideData,
  hidePinMessage,
  hideSyncingModal,
  hideXrays,
} from "../../actions";
import {
  getCandidatesQuery,
  getShowData,
  getShowPinMessage,
  getShowSyncingModal,
  getShowXrays,
} from "../../selectors";
import {
  trackCollectionClick,
  trackDashboardClick,
  trackDatabaseClick,
} from "../../analytics";

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
  wrapped: true,
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

const databaseCandidatesProps = {
  query: (state: any, props: any) => getCandidatesQuery(props.databases),
  loadingAndErrorWrapper: false,
};

const mapStateToProps = (state: any) => ({
  user: getUser(state),
  showData: getShowData(state),
  showXrays: getShowXrays(state),
  showPinMessage: getShowPinMessage(state),
  showSyncingModal: getShowSyncingModal(state),
  onCollectionClick: trackCollectionClick,
  onDashboardClick: trackDashboardClick,
  onDatabaseClick: trackDatabaseClick,
});

const mapDispatchToProps = {
  onHideData: hideData,
  onHideXrays: hideXrays,
  onHidePinMessage: hidePinMessage,
  onHideSyncingModal: hideSyncingModal,
};

export default _.compose(
  Databases.loadList(databasesProps),
  Search.loadList(collectionsProps),
  Search.loadList(dashboardsProps),
  DatabaseCandidates.loadList(databaseCandidatesProps),
  connect(mapStateToProps, mapDispatchToProps),
)(Homepage);
