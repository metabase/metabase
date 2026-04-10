import { useListCommentsQuery } from "metabase/api";
import { getTargetChildCommentThreads } from "metabase/comments/utils";
import { getUnresolvedComments } from "metabase/documents/components/Editor/CommentsMenu";
import { getCurrentDocument } from "metabase/documents/selectors";
import { getListCommentsQuery } from "metabase/documents/utils/api";
import { useSelector } from "metabase/utils/redux";

export function useUnresolvedCommentsCount(targetId: string) {
  const document = useSelector(getCurrentDocument);

  const { unresolvedCommentsCount } = useListCommentsQuery(
    getListCommentsQuery(document),
    {
      selectFromResult: ({ data: commentsData }) => {
        const threads = getTargetChildCommentThreads(
          commentsData?.comments,
          targetId,
        );
        return {
          unresolvedCommentsCount: getUnresolvedComments(threads).length,
        };
      },
    },
  );

  return unresolvedCommentsCount;
}
