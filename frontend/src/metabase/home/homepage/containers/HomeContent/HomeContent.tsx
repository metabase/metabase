import _ from "underscore";
import Databases from "metabase/entities/databases";
import HomeContent from "../../components/HomeContent";

export default _.compose(Databases.loadList())(HomeContent);
