import { connect } from "react-redux";
import { getUser } from "metabase/selectors/user";

import type { User } from "metabase-types/api";
import type { State } from "metabase-types/store";

import HomeGreeting from "../../components/HomeGreeting";

const mapStateToProps = (state: State) => ({
  user: getUser(state) as User, // shouldn't be reachable for non-logged in users
  showLogo: state.settings.values["show-metabot"],
});

export default connect(mapStateToProps)(HomeGreeting);
