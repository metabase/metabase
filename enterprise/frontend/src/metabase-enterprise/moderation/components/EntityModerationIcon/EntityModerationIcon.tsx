import type Question from "metabase-lib/v1/Question";
import type { Card, Dashboard } from "metabase-types/api";

import ModerationReviewIcon from "../../containers/ModerationReviewIcon";
import { getLatestModerationReview } from "../../service";

export interface EntityModerationIconProps {
  question?: Question;
  dashboard?: Dashboard;
  card?: Card;
  filled?: boolean;
}

export const EntityModerationIcon = ({
  card,
  question,
  dashboard,
  filled,
}: EntityModerationIconProps): JSX.Element | null => {
  const entityReviews = question
    ? question.getModerationReviews()
    : card
      ? card.moderation_reviews
      : dashboard?.moderation_reviews;

  const review = getLatestModerationReview(entityReviews);

  if (review) {
    return <ModerationReviewIcon review={review} filled={filled} />;
  } else {
    return null;
  }
};
