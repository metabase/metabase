import { connect } from "react-redux";

import { checkNotNull } from "metabase/core/utils/types";

import { getSetting } from "metabase/selectors/settings";
import { getUser } from "metabase/selectors/user";

import type { State } from "metabase-types/store";

import HomeGreeting from "../../components/HomeGreeting";

const mapStateToProps = (state: State) => ({
  user: checkNotNull(getUser(state)),
  showLogo: getSetting(state, "show-metabot"),
});

export default connect(mapStateToProps)(HomeGreeting);
