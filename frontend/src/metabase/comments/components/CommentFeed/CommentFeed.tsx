import { Stack } from "metabase/ui";
import type { CardId, DashboardId, UserId } from "metabase-types/api";

import { CommentHtml } from "../comment/Comment";

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
      <CommentHtml />
      <CommentHtml />
      <CommentHtml />
      <CommentHtml />
      <CommentHtml />
      <CommentHtml />
      <CommentHtml />
      <CommentHtml />
      <CommentHtml />
      <CommentHtml />
      <CommentHtml />
    </Stack>
  );
}
