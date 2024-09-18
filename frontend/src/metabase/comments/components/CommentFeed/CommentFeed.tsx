import { useCreateCommentMutation, useListCommentQuery } from "metabase/api";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { Stack } from "metabase/ui";
import type {
  CardId,
  CommentModel,
  DashboardId,
  UserId,
} from "metabase-types/api";

import { CommentInput } from "../CommentInput/CommentInput";
import { CommentSection } from "../comment/CommentSection";

export function CommentFeed({
  model,
  modelId,
}: {
  model?: CommentModel;
  modelId?: CardId | DashboardId;
  userId?: UserId;
}) {
  const { data: comments, isLoading } = useListCommentQuery();
  const [saveComment] = useCreateCommentMutation();

  if (isLoading) {
    return <LoadingAndErrorWrapper loading error={null} />;
  }

  const canComment = Boolean(!!model && !!modelId);

  return (
    <Stack spacing="md">
      <CommentSection comments={comments} />
      {canComment && (
        <CommentInput
          placeholder="Add a comment..."
          onSubmit={text =>
            saveComment({
              text,
              model,
              model_id: modelId,
            })
          }
        />
      )}
    </Stack>
  );
}
