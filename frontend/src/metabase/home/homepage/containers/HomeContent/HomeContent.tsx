import { connect } from "react-redux";
import _ from "underscore";
import Databases from "metabase/entities/databases";
import RecentItems from "metabase/entities/recent-items";
import PopularItems from "metabase/entities/popular-items";
import { getUser } from "metabase/selectors/user";
import { State } from "metabase-types/store";
import HomeContent from "../../components/HomeContent";

const mapStateToProps = (state: State) => ({
  user: getUser(state),
});

export default _.compose(
  Databases.loadList({ loadingAndErrorWrapper: false }),
  RecentItems.loadList({ reload: true, loadingAndErrorWrapper: false }),
  PopularItems.loadList({ reload: true, loadingAndErrorWrapper: false }),
  connect(mapStateToProps),
)(HomeContent);
