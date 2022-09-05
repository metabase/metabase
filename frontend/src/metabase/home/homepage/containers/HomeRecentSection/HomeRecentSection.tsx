import { connect } from "react-redux";
import _ from "underscore";
import RecentItems from "metabase/entities/recent-items";
import { getUser } from "metabase/selectors/user";
import { State } from "metabase-types/store";
import HomeRecentSection from "../../components/HomeRecentSection";

const mapStateToProps = (state: State) => ({
  user: getUser(state),
});

export default _.compose(
  RecentItems.loadList(),
  connect(mapStateToProps),
)(HomeRecentSection);
