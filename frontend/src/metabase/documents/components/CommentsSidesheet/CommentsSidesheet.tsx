import { t } from "ttag";

import { Comments } from "metabase/comments/components/Comments";
import Animation from "metabase/css/core/animation.module.css";
import { useDocumentState } from "metabase/documents/hooks/use-document-state";
import { getCurrentDocument } from "metabase/documents/selectors";
import { useSelector } from "metabase/redux";
import { Box } from "metabase/ui";

interface Props {
  params?: {
    childTargetId?: string;
  };
}

export const CommentsSidesheet = ({ params }: Props) => {
  const childTargetId = params?.childTargetId;
  const { openCommentSidebar, closeCommentSidebar } = useDocumentState();
  const document = useSelector(getCurrentDocument);

  if (!childTargetId || !document) {
    return null;
  }

  return (
    <Box
      component="aside"
      pos="relative"
      h="100%"
      w="30rem"
      className={Animation.slideLeft}
      style={{
        borderLeft: "1px solid var(--mb-color-border-neutral)",
      }}
      data-testid="comments-sidebar"
    >
      <Comments
        commentTarget={{
          target_id: document.id,
          target_type: "document",
        }}
        childTargetId={childTargetId}
        onOpenComments={openCommentSidebar}
        onCloseComments={closeCommentSidebar}
        title={
          childTargetId === "all" ? t`All comments` : t`Comments about this`
        }
      />
    </Box>
  );
};
