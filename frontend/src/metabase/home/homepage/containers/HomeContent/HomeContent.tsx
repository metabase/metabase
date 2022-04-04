import { connect } from "react-redux";
import _ from "underscore";
import Databases from "metabase/entities/databases";
import Recents from "metabase/entities/recents";
import { getUser } from "metabase/selectors/user";
import { State } from "metabase-types/store";
import HomeContent from "../../components/HomeContent";

const mapStateToProps = (state: State) => ({
  user: getUser(state),
});

export default _.compose(
  Databases.loadList(),
  Recents.loadList({ reload: true }),
  connect(mapStateToProps),
)(HomeContent);
