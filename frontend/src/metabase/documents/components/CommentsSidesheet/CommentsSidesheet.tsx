import { useWindowEvent } from "@mantine/hooks";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLatest, useLocation } from "react-use";
import { t } from "ttag";

import noResultsSource from "assets/img/no_results.svg";
import { useCreateCommentMutation, useListCommentsQuery } from "metabase/api";
import { CommentEditor } from "metabase/comments/components";
import { Discussions } from "metabase/comments/components/Discussions";
import {
  deleteNewParamFromURLIfNeeded,
  getCommentNodeId,
  getCommentsCount,
} from "metabase/comments/utils";
import { useToast } from "metabase/common/hooks";
import Animation from "metabase/css/core/animation.module.css";
import { useDocumentState } from "metabase/documents/hooks/use-document-state";
import { getCurrentDocument } from "metabase/documents/selectors";
import { getListCommentsQuery } from "metabase/documents/utils/api";
import { useDispatch, useSelector } from "metabase/lib/redux";
import {
  ActionIcon,
  Box,
  Flex,
  Icon,
  Image,
  Tabs,
  Text,
  Title,
} from "metabase/ui";
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
  const [sendToast] = useToast();

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

  const resolvedCommentsCount = getCommentsCount(resolvedComments);

  const availableTabs = useMemo<SidesheetTab[]>(() => {
    // Only show tabs if there are resolved comments
    if (resolvedCommentsCount > 0) {
      return ["open", "resolved"];
    }

    return [];
  }, [resolvedCommentsCount]);

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

  useWindowEvent("keydown", (event) => {
    if (event.key === "Escape" && !event.defaultPrevented) {
      closeSidebar();
    }
  });

  const handleSubmit = async (doc: DocumentContent, html: string) => {
    if (!childTargetId || !document) {
      return;
    }

    const { error } = await createComment({
      child_target_id: childTargetId,
      target_id: document.id,
      target_type: "document",
      content: doc,
      parent_comment_id: null,
      html,
    });

    if (error) {
      sendToast({
        icon: "warning_triangle_filled",
        iconColor: "warning",
        message: t`Failed to send comment`,
      });
    } else {
      deleteNewParamFromURLIfNeeded(location, dispatch);
    }
  };

  if (!childTargetId || !document) {
    return null;
  }

  return (
    <Box
      component="aside"
      pos="relative"
      mah="100dvh"
      w="30rem"
      className={Animation.slideLeft}
      style={{
        borderLeft: "1px solid var(--mb-color-border)",
      }}
      data-testid="comments-sidebar"
    >
      <Flex px="xl" pt="1.25rem" pb="sm" justify="space-between" align="center">
        <Title order={3}>
          {childTargetId === "all" ? t`All comments` : t`Comments about this`}
        </Title>
        <ActionIcon onClick={closeSidebar}>
          <Icon name="close" c="text-primary" />
        </ActionIcon>
      </Flex>

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
              {t`Resolved (${resolvedCommentsCount})`}
            </Tabs.Tab>
          </Tabs.List>
        )}

        <Tabs.Panel value="open" className={S.tabPanel}>
          {activeComments.length > 0 && (
            <Discussions
              childTargetId={childTargetId === "all" ? null : childTargetId}
              comments={activeComments}
              enableHoverHighlight={childTargetId === "all"}
              targetId={document.id}
              targetType="document"
            />
          )}

          {activeComments.length === 0 && childTargetId === "all" && (
            <Flex
              p="xl"
              pt="5rem"
              align="center"
              color="muted"
              direction="column"
              gap="md"
            >
              <Image w={120} h={120} src={noResultsSource} />

              <Text fw="700" c="text-tertiary">{t`No comments`}</Text>
            </Flex>
          )}

          {childTargetId !== "all" && (
            <Box px="lg" py={activeComments.length === 0 ? "lg" : "xs"}>
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

        <Tabs.Panel value="resolved" className={S.tabPanel}>
          <Discussions
            childTargetId={childTargetId === "all" ? null : childTargetId}
            comments={resolvedComments}
            targetId={document.id}
            targetType="document"
          />
        </Tabs.Panel>
      </Tabs>
    </Box>
  );
};

function getFilteredComments(
  comments: Comment[],
  condition: (comment: Comment) => boolean,
) {
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
