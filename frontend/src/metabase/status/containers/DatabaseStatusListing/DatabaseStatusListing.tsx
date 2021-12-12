import { connect } from "react-redux";
import _ from "underscore";
import Databases from "metabase/entities/databases";
import { isSyncInProgress } from "metabase/lib/syncing";
import { getUser } from "metabase/selectors/user";
import DatabaseStatusListing from "../../components/DatabaseStatusListing";
import { Database } from "../../types";

const RELOAD_INTERVAL = 2000;

const databasesProps = {
  query: { include: "tables" },
  reloadInterval: (state: any, props: any, databases: Database[] = []) =>
    databases.some(isSyncInProgress) ? RELOAD_INTERVAL : 0,
  loadingAndErrorWrapper: false,
};

const mapStateToProps = (state: any) => ({
  user: getUser(state),
});

export default _.compose(
  Databases.loadList(databasesProps),
  connect(mapStateToProps),
)(DatabaseStatusListing);
