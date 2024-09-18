import { useDisclosure } from "@mantine/hooks";
import { useRef } from "react";
import { usePrevious } from "react-use";

import { useCurrentUser } from "embedding-sdk";
import {
  useCreateCommentMutation,
  useListCommentQuery,
  useResolveCommentMutation,
} from "metabase/api";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { Button, Icon, Stack } from "metabase/ui";
import type {
  CardId,
  CommentModel,
  DashboardId,
  UserId,
} from "metabase-types/api";

import type { Comment as CommentType } from "../../types";
import { CommentInput } from "../CommentInput/CommentInput";
import { CommentList } from "../comment-section/CommentSection";

export function CommentFeed({
  model,
  modelId,
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
    },
    {
      pollingInterval: 10000,
      skipPollingIfUnfocused: true,
    },
  );

  const [isResolvedThreadsOpen, { toggle }] = useDisclosure(false);

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

  const openThreads = comments?.filter(comment => !comment.resolved) ?? [];
  const resolvedThreads = comments?.filter(comment => comment.resolved) ?? [];

  return (
    <Stack spacing="xs">
      <Stack spacing="md" pr="md">
        <CommentList
          comments={openThreads}
          onResolve={(comment: CommentType) =>
            handleResolve({
              id: comment.id,
              resolved: !comment.resolved,
            })
          }
          onReply={saveComment}
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

      {resolvedThreads.length > 0 && (
        <Stack mt="-1.5rem">
          <Button
            styles={{
              inner: {
                justifyContent: "flex-start",
              },
            }}
            style={{ justifyContent: "flex-start" }}
            color="brand"
            variant="subtle"
            leftIcon={
              <Icon
                name={isResolvedThreadsOpen ? "chevrondown" : "chevronright"}
              />
            }
            onClick={toggle}
          >
            {resolvedThreads.length} resolved{" "}
            {resolvedThreads.length > 1 ? "threads" : "thread"}
          </Button>
          {isResolvedThreadsOpen && (
            <CommentList
              onReply={saveComment}
              shadowed={shadowed}
              comments={resolvedThreads}
            />
          )}
        </Stack>
      )}
    </Stack>
  );
}
