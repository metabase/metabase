import cx from "classnames";
import type { ReactNode } from "react";
import { t } from "ttag";

import Animation from "metabase/css/core/animation.module.css";
import { Group, Modal, Stack, rem } from "metabase/ui";

import S from "./Sidesheet.module.css";

interface Props {
  actions: ReactNode;
  children: ReactNode;
  onClose: () => void;
}

export function Sidesheet({ actions, children, onClose }: Props) {
  return (
    <Modal.Root h="100dvh" opened variant="sidesheet" onClose={onClose}>
      <Modal.Content
        classNames={{
          content: cx(S.content, Animation.slideLeft),
        }}
        data-testid="sidesheet"
        px="none"
        transitionProps={{ duration: 0 }}
        w={rem(720)}
      >
        <Modal.Body className={S.body} p={0}>
          <Group gap="lg" justify="flex-end" px="xl" py="lg">
            {actions}

            <Modal.CloseButton aria-label={t`Close`} />
          </Group>

          <Stack className={S.scrollable} gap={0} h="100%">
            {children}
          </Stack>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}
