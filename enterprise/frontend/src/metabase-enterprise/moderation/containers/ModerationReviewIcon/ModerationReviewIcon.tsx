import _ from "underscore";

import { connect } from "metabase/redux";
import type { State } from "metabase/redux/store";
import { getUser } from "metabase/selectors/user";
import type { User } from "metabase-types/api";

import ModerationReviewIcon from "../../components/ModerationReviewIcon";

const mapStateToProps = (state: State) => ({
  // user would already be loaded when rendering this component.
  currentUser: getUser(state) as User,
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(connect(mapStateToProps))(ModerationReviewIcon);
