import { getLatestModerationReview } from "metabase-enterprise/moderation/service";
import type Question from "metabase-lib/v1/Question";

import { ModerationReviewBanner } from "../ModerationReviewBanner/ModerationReviewBanner";

interface QuestionModerationSectionProps {
  question: Question;
  reviewBannerClassName?: string;
}

export function QuestionModerationSection({
  question,
  reviewBannerClassName,
}: QuestionModerationSectionProps) {
  const latestModerationReview = getLatestModerationReview(
    question.getModerationReviews(),
  );

  if (!latestModerationReview) {
    return null;
  }

  return (
    <ModerationReviewBanner
      className={reviewBannerClassName}
      moderationReview={latestModerationReview}
    />
  );
}
