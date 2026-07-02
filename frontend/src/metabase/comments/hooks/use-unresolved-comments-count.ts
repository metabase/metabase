import { skipToken, useListCommentsQuery } from "metabase/api";
import type { CommentThread } from "metabase/comments/types";
import {
  getListCommentsQuery,
  getTargetChildCommentThreads,
} from "metabase/comments/utils";
import type { CommentTarget } from "metabase-types/api";

interface UseUnresolvedCommentsCountOptions {
  target?: CommentTarget;
  childTargetId?: string;
  skip?: boolean;
}

export function useUnresolvedCommentsCount({
  target,
  childTargetId,
  skip = false,
}: UseUnresolvedCommentsCountOptions) {
  const query = skip ? skipToken : getListCommentsQuery(target);

  const { unresolvedCommentsCount, allCommentsCount } = useListCommentsQuery(
    query,
    {
      selectFromResult: ({ data: commentsData }) => {
        const threads = getTargetChildCommentThreads(
          commentsData?.comments,
          childTargetId,
        );
        return {
          unresolvedCommentsCount: getUnresolvedComments(threads).length,
          allCommentsCount:
            commentsData?.comments?.filter(
              (comment) => comment.child_target_id === childTargetId,
            ).length ?? 0,
        };
      },
    },
  );

  return { unresolvedCommentsCount, allCommentsCount };
}

export const getUnresolvedComments = (
  threads: CommentThread[],
): CommentThread["comments"] => {
  return threads
    .filter((thread) => !thread.comments[0]?.is_resolved)
    .flatMap((thread) =>
      thread.comments.filter((comment) => !comment.deleted_at),
    );
};
