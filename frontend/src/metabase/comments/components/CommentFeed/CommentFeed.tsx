import { useRef } from "react";
import { usePrevious } from "react-use";

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
import { CommentSection } from "../comment-section/CommentSection";

export function CommentFeed({
  model,
  modelId,
  autoScroll = false,
}: {
  model?: CommentModel;
  modelId?: CardId | DashboardId;
  userId?: UserId;
  autoScroll?: boolean;
}) {
  const { data: comments, isLoading } = useListCommentQuery(
    {
      model,
      model_id: modelId,
    },
    {
      pollingInterval: 1000,
      skipPollingIfUnfocused: true,
    },
  );

  const previousComments = usePrevious(comments);

  const [saveComment] = useCreateCommentMutation();
  const ref = useRef<HTMLDivElement>(null);

  if (isLoading) {
    return <LoadingAndErrorWrapper loading error={null} />;
  }

  const canComment = Boolean(!!model && !!modelId);

  const scrollToBottom = () => {
    if (ref.current) {
      ref.current.scrollIntoView({ behavior: "smooth" });
    }
  };

  if (autoScroll && comments?.length !== previousComments?.length) {
    window.requestAnimationFrame(() => {
      setTimeout(() => scrollToBottom(), 100);
    });
  }

  return (
    <Stack spacing="md">
      <CommentSection comments={comments} onReply={saveComment} />
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
          pos="sticky"
          bottom={0}
        />
      )}
      <div ref={ref} />
    </Stack>
  );
}
