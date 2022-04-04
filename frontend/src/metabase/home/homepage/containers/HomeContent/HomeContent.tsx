import _ from "underscore";
import Databases from "metabase/entities/databases";
import Recents from "metabase/entities/recents";
import HomeContent from "../../components/HomeContent";

export default _.compose(
  Databases.loadList(),
  Recents.loadList({ reload: true }),
)(HomeContent);
