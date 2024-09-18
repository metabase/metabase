import { useRef } from "react";
import { usePrevious } from "react-use";

import { useCurrentUser } from "embedding-sdk";
import {
  useCreateCommentMutation,
  useListCommentQuery,
  useResolveCommentMutation,
} from "metabase/api";
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
  userId,
  autoScroll = false,
  shadowed = false,
}: {
  model?: CommentModel;
  modelId?: CardId | DashboardId;
  userId?: UserId;
  autoScroll?: boolean;
  shadowed?: boolean;
}) {
  const { data: comments, isLoading } = useListCommentQuery(
    {
      model,
      model_id: modelId,
      user_id: userId,
    },
    {
      pollingInterval: 3000,
      skipPollingIfUnfocused: true,
    },
  );

  const user = useCurrentUser();

  const previousComments = usePrevious(comments);

  const [saveComment] = useCreateCommentMutation();
  const [handleResolve] = useResolveCommentMutation();

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
    <Stack spacing="md" pr="md">
      <CommentSection
        comments={comments}
        onReply={saveComment}
        onResolve={handleResolve}
        currentUser={user}
        shadowed={shadowed}
      />
      {canComment && (
        <CommentInput
          placeholder="Add a comment..."
          user={user}
          onSubmit={text =>
            saveComment({
              text,
              model,
              model_id: modelId,
            })
          }
        />
      )}
      <div ref={ref} />
    </Stack>
  );
}
