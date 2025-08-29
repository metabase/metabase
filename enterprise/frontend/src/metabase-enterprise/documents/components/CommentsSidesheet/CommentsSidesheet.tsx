import cx from "classnames";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-use";
import { t } from "ttag";

import Animation from "metabase/css/core/animation.module.css";
import { Modal, Tabs, rem } from "metabase/ui";
import { Discussions } from "metabase-enterprise/comments/components/Discussions";

import { useDocumentContext } from "../DocumentContext";

import S from "./CommentsSidesheet.module.css";

interface Props {
  params?: {
    childTargetId: string;
  };
  onClose: () => void;
}

export const CommentsSidesheet = ({ params, onClose }: Props) => {
  const childTargetId = params?.childTargetId;
  const location = useLocation();

  const [activeTab, setActiveTab] = useState<string | null>("open");
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

  useEffect(() => {
    if (childTargetId == null) {
      onClose();
    }
  }, [childTargetId, onClose]);

  const resolvedComments = useMemo(
    () => targetComments?.filter((comment) => comment.is_resolved) ?? [],
    [targetComments],
  );

  const activeComments = useMemo(
    () => targetComments?.filter((comment) => !comment.is_resolved) ?? [],
    [targetComments],
  );

  // Determine which tab should be active based on available comments
  const availableTabs = useMemo(() => {
    const tabs = [];
    // Only show tabs if there are resolved comments
    if (resolvedComments.length > 0) {
      tabs.push("open");
      tabs.push("resolved");
    }
    return tabs;
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

  if (!childTargetId || !document) {
    return null;
  }

  return (
    <Modal.Root
      h="100dvh"
      lockScroll={false}
      opened
      variant="sidesheet"
      onClose={onClose}
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
          <Modal.CloseButton />
        </Modal.Header>
        <Modal.Body className={S.body} p={0}>
          {availableTabs.length > 0 ? (
            <Tabs value={activeTab} onChange={setActiveTab}>
              <Tabs.List px="1.625rem" className={S.tabsList}>
                <Tabs.Tab value="open">{t`Open`}</Tabs.Tab>
                <Tabs.Tab value="resolved">
                  {t`Resolved (${resolvedComments.length})`}
                </Tabs.Tab>
              </Tabs.List>
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
                />
              </Tabs.Panel>
            </Tabs>
          ) : (
            // No resolved comments, show Open tab content directly (without tabs)
            <Discussions
              childTargetId={childTargetId}
              comments={activeComments}
              targetId={document.id}
              targetType="document"
              autoOpenNewComment={shouldAutoOpenNewComment}
            />
          )}
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
};
