import _ from "underscore";
import Databases from "metabase/entities/databases";
import SyncSnackbarSwitch from "../../components/SyncSnackbarSwitch";

export default _.compose(Databases.loadList())(SyncSnackbarSwitch);
