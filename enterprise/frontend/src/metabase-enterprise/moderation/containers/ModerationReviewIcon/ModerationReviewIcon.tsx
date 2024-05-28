import { connect } from "react-redux";
import _ from "underscore";

import Users from "metabase/entities/users";
import { getUser } from "metabase/selectors/user";
import type { ModerationReview } from "metabase-types/api";
import type { State } from "metabase-types/store";

import ModerationReviewIcon from "../../components/ModerationReviewIcon";

interface ModerationReviewIconProps {
  review: ModerationReview;
}

const mapStateToProps = (state: State) => ({
  currentUser: getUser(state),
});

const userProps = {
  id: (state: State, props: ModerationReviewIconProps) =>
    props.review.moderator_id,
  entityAlias: "moderator",
  loadingAndErrorWrapper: false,
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Users.load(userProps),
  connect(mapStateToProps),
)(ModerationReviewIcon);
