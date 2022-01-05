import { connect } from "react-redux";
import _ from "underscore";
import Databases from "metabase/entities/databases";
import { isSyncInProgress } from "metabase/lib/syncing";
import { getUser } from "metabase/selectors/user";
import { Database } from "metabase-types/api";
import DatabaseStatus from "../../components/DatabaseStatus";

const RELOAD_INTERVAL = 2000;

const databasesProps = {
  loadingAndErrorWrapper: false,
  reloadInterval: (state: any, props: any, databases: Database[] = []) =>
    databases.some(isSyncInProgress) ? RELOAD_INTERVAL : 0,
};

const mapStateToProps = (state: any) => ({
  user: getUser(state),
});

export default _.compose(
  Databases.loadList(databasesProps),
  connect(mapStateToProps),
)(DatabaseStatus);
