import cx from "classnames";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLatest, useLocation } from "react-use";
import { t } from "ttag";

import Animation from "metabase/css/core/animation.module.css";
import { Modal, Tabs, rem } from "metabase/ui";
import { Discussions } from "metabase-enterprise/comments/components/Discussions";
import { getCommentNodeId } from "metabase-enterprise/comments/utils";
import { useDocumentState } from "metabase-enterprise/documents/hooks/use-document-state";

import { useDocumentContext } from "../DocumentContext";

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
  const { comments, document } = useDocumentContext();

  // Check if we should auto-open the new comment form
  const shouldAutoOpenNewComment = useMemo(() => {
    const searchParams = new URLSearchParams(location.search);
    return searchParams.get("new") === "true";
  }, [location.search]);

  const targetComments = useMemo(() => {
    if (!comments) {
      return [];
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
    () => targetComments?.filter((comment) => comment.is_resolved) ?? [],
    [targetComments],
  );

  const activeComments = useMemo(
    () => targetComments?.filter((comment) => !comment.is_resolved) ?? [],
    [targetComments],
  );

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
          <Modal.Title>{t`Comments`}</Modal.Title>
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
                <Tabs.Tab value="open">{t`Open`}</Tabs.Tab>
                <Tabs.Tab value="resolved">
                  {t`Resolved (${resolvedComments.length})`}
                </Tabs.Tab>
              </Tabs.List>
            )}

            <Tabs.Panel value="open">
              <Discussions
                childTargetId={childTargetId}
                comments={activeComments}
                targetId={document.id}
                targetType="document"
                autoOpenNewComment={shouldAutoOpenNewComment}
              />
            </Tabs.Panel>

            <Tabs.Panel value="resolved">
              <Discussions
                childTargetId={childTargetId}
                comments={resolvedComments}
                targetId={document.id}
                targetType="document"
                allowNewThreads={false}
              />
            </Tabs.Panel>
          </Tabs>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
};
