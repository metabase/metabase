import { skipToken, useListCommentsQuery } from "metabase/api";
import {
  getListCommentsQuery,
  getTargetChildCommentThreads,
} from "metabase/comments/utils";
import { getUnresolvedComments } from "metabase/documents/components/Editor/CommentsMenu";
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

  const { unresolvedCommentsCount } = useListCommentsQuery(query, {
    selectFromResult: ({ data: commentsData }) => {
      const threads = getTargetChildCommentThreads(
        commentsData?.comments,
        childTargetId,
      );
      return {
        unresolvedCommentsCount: getUnresolvedComments(threads).length,
      };
    },
  });

  return unresolvedCommentsCount;
}
