import { connect } from "react-redux";

import { checkNotNull } from "metabase/core/utils/types";

import { getUser } from "metabase/selectors/user";

import type { User } from "metabase-types/api";
import type { State } from "metabase-types/store";

import HomeGreeting from "../../components/HomeGreeting";

const mapStateToProps = (state: State) => ({
  user: checkNotNull<User>(getUser(state)),
  showLogo: state.settings.values["show-metabot"],
});

export default connect(mapStateToProps)(HomeGreeting);
