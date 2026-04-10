import _ from "underscore";

import { getUser } from "metabase/selectors/user";
import { connect } from "metabase/utils/redux";
import type { User } from "metabase-types/api";
import type { State } from "metabase-types/store";

import ModerationReviewIcon from "../../components/ModerationReviewIcon";

const mapStateToProps = (state: State) => ({
  // user would already be loaded when rendering this component.
  currentUser: getUser(state) as User,
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(connect(mapStateToProps))(ModerationReviewIcon);
