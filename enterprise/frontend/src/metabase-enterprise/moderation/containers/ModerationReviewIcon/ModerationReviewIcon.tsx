import { connect } from "react-redux";
import _ from "underscore";

import { getUser } from "metabase/selectors/user";
import type { State } from "metabase-types/store";

import ModerationReviewIcon from "../../components/ModerationReviewIcon";

const mapStateToProps = (state: State) => ({
  currentUser: getUser(state),
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(connect(mapStateToProps))(ModerationReviewIcon);
