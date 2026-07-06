import { useWindowEvent } from "@mantine/hooks";
import { useCallback, useEffect, useMemo, useState } from "react";
import { push } from "react-router-redux";
import { useLatest, useLocation } from "react-use";
import { t } from "ttag";

import noResultsSource from "assets/img/no_results.svg";
import { useCreateCommentMutation, useListCommentsQuery } from "metabase/api";
import { CommentEditor } from "metabase/comments/components";
import { Discussions } from "metabase/comments/components/Discussions";
import type {
  CommentExtraRenderer,
  CommentsLayout,
} from "metabase/comments/types";
import {
  getCommentNodeId,
  getCommentsCount,
  getListCommentsQuery,
} from "metabase/comments/utils";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useToast } from "metabase/common/hooks";
import { useDispatch } from "metabase/redux";
import {
  ActionIcon,
  Box,
  Flex,
  Icon,
  Image,
  Menu,
  Stack,
  Tabs,
  Text,
  Title,
} from "metabase/ui";
import type {
  Comment,
  CommentContext,
  CommentTarget,
  DocumentContent,
} from "metabase-types/api";

import S from "./Comments.module.css";

type SidesheetTab = "open" | "resolved";

interface CommentsProps {
  commentTarget: CommentTarget;
  childTargetId: string;
  onOpenComments?: () => void;
  onCloseComments?: () => void;
  title?: string;
  showCloseButton?: boolean;
  context?: CommentContext;
  onHoverChange?: (childTargetId: string | undefined) => void;
  renderExtra?: CommentExtraRenderer;
  disableAutoFocus?: boolean;
  layout?: CommentsLayout;
}

export const Comments = ({
  commentTarget,
  childTargetId,
  onOpenComments,
  onCloseComments,
  title,
  showCloseButton = true,
  context,
  onHoverChange,
  renderExtra,
  disableAutoFocus = false,
  layout = "sidesheet",
}: CommentsProps) => {
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<SidesheetTab | null>("open");
  const [, setNewComment] = useState<DocumentContent>();
  const {
    data: commentsData,
    isLoading,
    error,
  } = useListCommentsQuery(getListCommentsQuery(commentTarget));
  const comments = commentsData?.comments;
  const dispatch = useDispatch();
  const [sendToast] = useToast();
  const isSidebar = layout === "sidebar";

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
    onCloseComments?.();
    // ModalRoute's onClose method doesn't preserve search query params
    // we need them for explorations, so manually preserve them
    const { pathname = "" } = location;
    const existingCommentIndex = pathname.lastIndexOf("/comments/");
    const nextPathname =
      existingCommentIndex !== -1
        ? pathname.slice(0, existingCommentIndex)
        : pathname;
    dispatch(
      push({
        pathname: nextPathname,
        search: location.search,
      }),
    );
  }, [onCloseComments, dispatch, location]);

  useEffect(() => {
    onOpenComments?.();
  }, [onOpenComments]);

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
    // The sidebar always offers the Open/Resolved filter in its header, so both
    // tabs stay selectable even before any comment has been resolved.
    if (isSidebar || resolvedCommentsCount > 0) {
      return ["open", "resolved"];
    }

    return [];
  }, [isSidebar, resolvedCommentsCount]);

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

  const handleSubmit = async (doc: DocumentContent) => {
    const { error } = await createComment({
      child_target_id: childTargetId,
      target_id: commentTarget.target_id,
      target_type: commentTarget.target_type,
      content: doc,
      parent_comment_id: null,
      context,
    });

    if (error) {
      sendToast({
        icon: "warning_triangle_filled",
        iconColor: "warning",
        message: t`Failed to send comment`,
      });
    }
  };

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  // In the sidebar layout the composer is pinned to the bottom of the sidebar
  // instead of sitting inline at the end of the scrolling comment list.
  const showPinnedComposer =
    isSidebar && childTargetId !== "all" && activeTab !== "resolved";

  return (
    <Stack gap={0} h="100%">
      {isSidebar ? (
        <Flex px="lg" pt="md" pb="sm" justify="space-between" align="center">
          <Title order={4}>{t`Comments`}</Title>
          <Menu position="bottom-end">
            <Menu.Target>
              <ActionIcon
                aria-label={t`Filter comments`}
                data-testid="comments-filter"
              >
                <Icon name="filter" c="text-secondary" />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={
                  <Icon name={activeTab === "open" ? "check" : "empty"} />
                }
                onClick={() => setActiveTab("open")}
              >
                {t`Open`}
              </Menu.Item>
              <Menu.Item
                leftSection={
                  <Icon name={activeTab === "resolved" ? "check" : "empty"} />
                }
                onClick={() => setActiveTab("resolved")}
              >
                {t`Resolved (${resolvedCommentsCount})`}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Flex>
      ) : (
        (title || showCloseButton) && (
          <Flex
            px="xl"
            pt="1.25rem"
            pb="sm"
            justify="space-between"
            align="center"
          >
            {title && <Title order={3}>{title}</Title>}
            {showCloseButton && (
              <ActionIcon aria-label={t`Close`} onClick={closeSidebar}>
                <Icon name="close" c="text-primary" />
              </ActionIcon>
            )}
          </Flex>
        )
      )}

      <Tabs
        className={S.tabsContainer}
        value={activeTab}
        onChange={(value) => {
          setActiveTab(value as SidesheetTab);
        }}
      >
        {!isSidebar && availableTabs.length > 0 && (
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
              onHoverChange={onHoverChange}
              targetId={commentTarget.target_id}
              targetType={commentTarget.target_type}
              renderExtra={renderExtra}
              layout={layout}
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

              <Text fw="700" c="text-disabled">{t`No comments`}</Text>
            </Flex>
          )}

          {!isSidebar && childTargetId !== "all" && (
            <Box px="lg" py={activeComments.length === 0 ? "lg" : "xs"}>
              <CommentEditor
                autoFocus={activeComments.length === 0 && !disableAutoFocus}
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
            targetId={commentTarget.target_id}
            targetType={commentTarget.target_type}
            renderExtra={renderExtra}
            layout={layout}
          />
        </Tabs.Panel>
      </Tabs>

      {showPinnedComposer && (
        <Box className={S.pinnedComposer} px="lg" py="md">
          <CommentEditor
            autoFocus={activeComments.length === 0 && !disableAutoFocus}
            data-testid="new-thread-editor"
            placeholder={t`Add a comment…`}
            onChange={(document) => setNewComment(document)}
            onSubmit={handleSubmit}
          />
        </Box>
      )}
    </Stack>
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
