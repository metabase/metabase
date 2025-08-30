import cx from "classnames";
import { useEffect, useMemo, useState } from "react";
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

  const [activeTab, setActiveTab] = useState<string | null>("open");
  const { comments, document } = useDocumentContext();

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
        <Modal.Header px="xl" className={S.header}>
          <Modal.Title>{t`Discussions`}</Modal.Title>
          <Modal.CloseButton />
        </Modal.Header>
        <Modal.Body className={S.body} p={0}>
          <Tabs value={activeTab} onChange={setActiveTab}>
            <Tabs.List px="1.625rem" className={S.tabsList}>
              <Tabs.Tab value="open">{t`Active`}</Tabs.Tab>
              <Tabs.Tab value="resolved">{t`Resolved`}</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="open">
              <Discussions
                childTargetId={childTargetId}
                comments={activeComments}
                targetId={document.id}
                targetType="document"
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
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
};
