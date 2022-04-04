import { connect } from "react-redux";
import _ from "underscore";
import Databases from "metabase/entities/databases";
import RecentViews from "metabase/entities/recent-views";
import { getUser } from "metabase/selectors/user";
import { State } from "metabase-types/store";
import HomeContent from "../../components/HomeContent";

const mapStateToProps = (state: State) => ({
  user: getUser(state),
});

export default _.compose(
  Databases.loadList(),
  RecentViews.loadList({ reload: true }),
  connect(mapStateToProps),
)(HomeContent);
