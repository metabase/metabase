import { useCallback } from "react";
import { t } from "ttag";

import { Comments } from "metabase/comments/components/Comments";
import Animation from "metabase/css/core/animation.module.css";
import { setHoveredChildTargetId } from "metabase/documents/documents.slice";
import { useDocumentState } from "metabase/documents/hooks/use-document-state";
import { getCurrentDocument } from "metabase/documents/selectors";
import { useDispatch, useSelector } from "metabase/redux";
import { Box } from "metabase/ui";

interface Props {
  params?: {
    childTargetId?: string;
  };
  onClose: () => void;
}

export const CommentsSidesheet = ({ params, onClose }: Props) => {
  const childTargetId = params?.childTargetId;
  const { openCommentSidebar, closeCommentSidebar } = useDocumentState();
  const document = useSelector(getCurrentDocument);
  const dispatch = useDispatch();

  const closeSidebar = useCallback(() => {
    closeCommentSidebar();
    onClose();
  }, [closeCommentSidebar, onClose]);

  const handleHoverChange = useCallback(
    (hoveredChildTargetId: string | undefined) => {
      dispatch(setHoveredChildTargetId(hoveredChildTargetId));
    },
    [dispatch],
  );

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
        onCloseComments={closeSidebar}
        title={
          childTargetId === "all" ? t`All comments` : t`Comments about this`
        }
        onHoverChange={childTargetId === "all" ? handleHoverChange : undefined}
      />
    </Box>
  );
};
