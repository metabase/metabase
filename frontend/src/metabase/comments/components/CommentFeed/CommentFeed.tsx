import { Stack } from "metabase/ui";
import type { CardId, DashboardId, UserId } from "metabase-types/api";

import { CommentSection } from "../comment/CommentSection";

export function CommentFeed({
  model,
  modelId,
  userId,
}: {
  model?: "dashboard" | "question";
  modelId?: CardId | DashboardId;
  userId?: UserId;
}) {
  console.warn({ model, modelId, userId });
  return (
    <Stack spacing="md">
      <CommentSection />
    </Stack>
  );
}
