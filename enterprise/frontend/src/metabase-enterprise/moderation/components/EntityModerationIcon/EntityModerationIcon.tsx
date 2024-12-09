import type Question from "metabase-lib/v1/Question";
import type { Dashboard } from "metabase-types/api";

import ModerationReviewIcon from "../../containers/ModerationReviewIcon";
import { getLatestModerationReview } from "../../service";

export interface EntityModerationIconProps {
  question?: Question;
  dashboard?: Dashboard;
}

export const EntityModerationIcon = ({
  question,
  dashboard,
}: EntityModerationIconProps): JSX.Element | null => {
  const entityReviews = question
    ? question.getModerationReviews()
    : dashboard?.moderation_reviews;

  const review = getLatestModerationReview(entityReviews);

  if (review) {
    return <ModerationReviewIcon review={review} />;
  } else {
    return null;
  }
};
