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
  hideXrays,
  hideSyncingModal,
} from "../../actions";
import {
  getShowData,
  getShowPinMessage,
  getShowXrays,
  getShowSyncingModal,
} from "../../selectors";
import { Database } from "../../types";

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
  query: (state: any, { databases = [] }: { databases: Database[] }) => {
    const [sampleDatabases, userDatabases] = _.partition(
      databases,
      d => d.is_sample,
    );

    if (userDatabases.length) {
      return { id: userDatabases[0].id };
    } else if (sampleDatabases.length) {
      return { id: sampleDatabases[0].id };
    }
  },
  loadingAndErrorWrapper: false,
};

const mapStateToProps = (state: any) => ({
  user: getUser(state),
  showData: getShowData(state),
  showXrays: getShowXrays(state),
  showPinMessage: getShowPinMessage(state),
  showSyncingModal: getShowSyncingModal(state),
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
