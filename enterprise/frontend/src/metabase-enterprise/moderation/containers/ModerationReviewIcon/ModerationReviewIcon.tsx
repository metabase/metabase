import { connect } from "react-redux";
import _ from "underscore";
import Users from "metabase/entities/users";
import { getUser } from "metabase/selectors/user";
import { ModerationReview } from "metabase-types/api";
import { State } from "metabase-types/store";
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

export default _.compose(
  Users.load(userProps),
  connect(mapStateToProps),
)(ModerationReviewIcon);
