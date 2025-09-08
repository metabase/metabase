import { useWindowEvent } from "@mantine/hooks";
import cx from "classnames";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLatest, useLocation } from "react-use";
import { t } from "ttag";

import Animation from "metabase/css/core/animation.module.css";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { Box, Modal, Tabs, rem } from "metabase/ui";
import {
  useCreateCommentMutation,
  useListCommentsQuery,
} from "metabase-enterprise/api";
import { CommentEditor } from "metabase-enterprise/comments/components";
import { Discussions } from "metabase-enterprise/comments/components/Discussions";
import {
  deleteNewParamFromURLIfNeeded,
  getCommentNodeId,
} from "metabase-enterprise/comments/utils";
import { useDocumentState } from "metabase-enterprise/documents/hooks/use-document-state";
import { getCurrentDocument } from "metabase-enterprise/documents/selectors";
import { getListCommentsQuery } from "metabase-enterprise/documents/utils/api";
import type { Comment, DocumentContent } from "metabase-types/api";

import S from "./CommentsSidesheet.module.css";

type SidesheetTab = "open" | "resolved";

interface Props {
  params?: {
    childTargetId: string;
  };
  onClose: () => void;
}

export const CommentsSidesheet = ({ params, onClose }: Props) => {
  const childTargetId = params?.childTargetId;
  const location = useLocation();
  const { openCommentSidebar, closeCommentSidebar } = useDocumentState();
  const [activeTab, setActiveTab] = useState<SidesheetTab | null>("open");
  const [, setNewComment] = useState<DocumentContent>();
  const document = useSelector(getCurrentDocument);
  const { data: commentsData } = useListCommentsQuery(
    getListCommentsQuery(document),
  );
  const comments = commentsData?.comments;
  const dispatch = useDispatch();

  // Check if we should auto-open the new comment form
  const shouldAutoOpenNewComment = useMemo(() => {
    const searchParams = new URLSearchParams(location.search);
    return searchParams.get("new") === "true";
  }, [location.search]);

  const targetComments = useMemo(() => {
    if (!comments) {
      return [];
    }

    if (childTargetId === "all") {
      return comments;
    }

    return comments.filter(
      (comment) => comment.child_target_id === childTargetId,
    );
  }, [comments, childTargetId]);

  const closeSidebar = useCallback(() => {
    closeCommentSidebar();
    onClose();
  }, [closeCommentSidebar, onClose]);

  useEffect(() => {
    if (childTargetId == null) {
      closeSidebar();
      return;
    }
    openCommentSidebar();
  }, [childTargetId, closeSidebar, openCommentSidebar]);

  const resolvedComments = useMemo(
    () =>
      targetComments
        ? getFilteredComments(targetComments, (comment) => comment.is_resolved)
        : [],
    [targetComments],
  );

  const activeComments = useMemo(
    () =>
      targetComments
        ? getFilteredComments(targetComments, (comment) => !comment.is_resolved)
        : [],
    [targetComments],
  );

  const [createComment] = useCreateCommentMutation();

  const availableTabs = useMemo<SidesheetTab[]>(() => {
    // Only show tabs if there are resolved comments
    if (resolvedComments.length > 0) {
      return ["open", "resolved"];
    }

    return [];
  }, [resolvedComments.length]);

  // Update active tab if current tab is not available
  useEffect(() => {
    if (
      availableTabs.length > 0 &&
      activeTab &&
      !availableTabs.includes(activeTab)
    ) {
      setActiveTab(availableTabs[0]);
    } else if (availableTabs.length === 0 && activeTab === "resolved") {
      // when we're on resolved tab and then create a new comment, nothing is rendered
      setActiveTab("open");
    }
  }, [availableTabs, activeTab]);

  const hash = location.hash?.substring(1);
  const isHashCommentResolved = resolvedComments.some((comment) => {
    return getCommentNodeId(comment) === hash;
  });
  const isHashCommentUnresolved = activeComments.some((comment) => {
    return getCommentNodeId(comment) === hash;
  });
  const activeTabRef = useLatest(activeTab);

  useEffect(() => {
    const activeTab = activeTabRef.current;

    if (activeTab === "open" && isHashCommentResolved) {
      setActiveTab("resolved");
    } else if (activeTab === "resolved" && isHashCommentUnresolved) {
      setActiveTab("open");
    }
  }, [hash, activeTabRef, isHashCommentResolved, isHashCommentUnresolved]);

  // Mantine modal, at least in v8 listens to `window` events in capture mode (before bubbling up),
  // so the modal closes before the event reaches the comment editor
  // See: https://github.com/mantinedev/mantine/blob/master/packages/%40mantine/core/src/components/ModalBase/use-modal.ts#L43
  // Therefore we need to listen for escape events during the bubbling phase, not the capture phase
  const closeOnEscape = false;
  useWindowEvent("keydown", (event) => {
    if (event.key === "Escape" && !event.defaultPrevented) {
      closeSidebar();
    }
  });

  const handleSubmit = async (doc: DocumentContent) => {
    if (!childTargetId || !document) {
      return;
    }

    try {
      await createComment({
        child_target_id: childTargetId,
        target_id: document.id,
        target_type: "document",
        content: doc,
        parent_comment_id: null,
      });

      deleteNewParamFromURLIfNeeded(location, dispatch);
    } catch (error) {
      console.error("Failed to create comment:", error);
    }
  };

  if (!childTargetId || !document) {
    return null;
  }

  return (
    <Modal.Root
      h="100dvh"
      lockScroll={false}
      opened
      variant="sidesheet"
      onClose={closeSidebar}
      closeOnEscape={closeOnEscape}
    >
      <Modal.Content
        classNames={{
          content: cx(S.content, Animation.slideLeft),
        }}
        data-testid="sidesheet"
        px="none"
        transitionProps={{ duration: 0 }}
        w={rem(400)}
      >
        <Modal.Header px="xl">
          <Modal.Title>
            {childTargetId === "all" ? t`All comments` : t`Comments`}
          </Modal.Title>
          <Modal.CloseButton onClick={closeSidebar} />
        </Modal.Header>

        <Modal.Body className={S.body} p={0}>
          <Tabs
            value={activeTab}
            onChange={(value) => {
              setActiveTab(value as SidesheetTab);
            }}
          >
            {availableTabs.length > 0 && (
              <Tabs.List px="1.625rem" className={S.tabsList}>
                <Tabs.Tab value="open" data-testid="comments-open-tab">
                  {t`Open`}
                </Tabs.Tab>
                <Tabs.Tab value="resolved" data-testid="comments-resolved-tab">
                  {t`Resolved (${resolvedComments.length})`}
                </Tabs.Tab>
              </Tabs.List>
            )}

            <Tabs.Panel value="open">
              <Discussions
                childTargetId={childTargetId === "all" ? null : childTargetId}
                comments={activeComments}
                showLastDivider
                targetId={document.id}
                targetType="document"
              />

              {childTargetId !== "all" && (
                <Box p="xl">
                  <CommentEditor
                    autoFocus={shouldAutoOpenNewComment}
                    data-testid="new-thread-editor"
                    placeholder={t`Add a comment…`}
                    onChange={(document) => setNewComment(document)}
                    onSubmit={handleSubmit}
                  />
                </Box>
              )}
            </Tabs.Panel>

            <Tabs.Panel value="resolved">
              <Discussions
                childTargetId={childTargetId === "all" ? null : childTargetId}
                comments={resolvedComments}
                targetId={document.id}
                targetType="document"
              />
            </Tabs.Panel>
          </Tabs>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
};

function getFilteredComments(
  comments: Comment[],
  condition: (comment: Comment) => boolean,
) {
  if (!comments) {
    return [];
  }

  const parentComments = comments.filter(
    (comment) => !comment.parent_comment_id && condition(comment),
  );
  const parentCommentIds = new Set(parentComments.map((thread) => thread.id));

  return [
    ...parentComments,
    ...comments.filter(
      (comment) =>
        comment.parent_comment_id &&
        parentCommentIds.has(comment.parent_comment_id),
    ),
  ];
}
