import _ from "underscore";
import Databases from "metabase/entities/databases";
import SyncStatus from "../../components/SyncStatus";

export default _.compose(Databases.loadList())(SyncStatus);
