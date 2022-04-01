import _ from "underscore";
import Databases from "metabase/entities/databases";
import RecentViews from "metabase/entities/recent-views";
import HomeContent from "../../components/HomeContent";

export default _.compose(
  Databases.loadList(),
  RecentViews.loadList({ reload: true }),
)(HomeContent);
