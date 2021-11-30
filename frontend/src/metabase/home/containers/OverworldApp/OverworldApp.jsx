import _ from "underscore";
import Databases from "metabase/entities/databases";
import Overworld from "../../components/Overworld/Overworld";

export default _.compose(Databases.loadList())(Overworld);
