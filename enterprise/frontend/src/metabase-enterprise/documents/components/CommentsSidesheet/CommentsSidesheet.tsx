import cx from "classnames";
import { useEffect, useMemo } from "react";
import { t } from "ttag";

import Animation from "metabase/css/core/animation.module.css";
import { Button, Group, Icon, Modal, Stack, Tooltip, rem } from "metabase/ui";
import { Discussion } from "metabase-enterprise/comments/components";

import { useDocumentContext } from "../DocumentContext";

import S from "./CommentsSidesheet.module.css";

interface Props {
  params?: {
    targetChildId: string;
  };
  onClose: () => void;
}

export const CommentsSidesheet = ({ params, onClose }: Props) => {
  const targetChildId = params?.targetChildId;

  const { comments } = useDocumentContext();

  const targetComments = useMemo(() => {
    if (!comments) {
      return [];
    }

    return comments.filter(
      (comment) => comment.child_target_id === targetChildId,
    );
  }, [comments, targetChildId]);

  useEffect(() => {
    if (targetChildId == null) {
      onClose();
    }
  }, [targetChildId, onClose]);

  return (
    <Modal.Root h="100dvh" opened variant="sidesheet" onClose={onClose}>
      <Modal.Content
        classNames={{
          content: cx(S.content, Animation.slideLeft),
        }}
        data-testid="sidesheet"
        px="none"
        transitionProps={{ duration: 0 }}
        w={rem(400)}
      >
        <Modal.Body className={S.body} p={0} pt="lg">
          <Group gap="lg" justify="flex-end" px="xl">
            <Tooltip label={t`Close`}>
              <Button
                aria-label={t`Close`}
                c="text-dark"
                h={20}
                leftSection={<Icon name="close" />}
                p={0}
                variant="subtle"
                w={20}
                onClick={onClose}
              />
            </Tooltip>
          </Group>

          <Stack className={S.scrollable} gap={0} h="100%" p="xl">
            <Discussion comments={targetComments} />
          </Stack>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
};
