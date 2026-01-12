import cx from "classnames";
import type { ReactNode } from "react";
import { t } from "ttag";

import Animation from "metabase/css/core/animation.module.css";
import { Button, Group, Icon, Modal, Stack, Tooltip, rem } from "metabase/ui";

import S from "./Sidesheet.module.css";

interface Props {
  actions?: ReactNode;
  children: ReactNode;
  "data-testid"?: string;
  onClose: () => void;
}

export function Sidesheet({
  actions,
  "data-testid": dataTestId,
  children,
  onClose,
}: Props) {
  return (
    <Modal.Root
      data-testid={dataTestId}
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
        w={rem(720)}
      >
        <Modal.Body className={S.body} p={0} pt="lg">
          <Group gap="lg" justify="flex-end" px="xl">
            {actions}

            <Tooltip label={t`Close`}>
              <Button
                aria-label={t`Close`}
                c="text-primary"
                h={20}
                leftSection={<Icon name="close" />}
                p={0}
                variant="subtle"
                w={20}
                onClick={onClose}
              />
            </Tooltip>
          </Group>

          <Stack className={S.scrollable} gap={0} h="100%">
            {children}
          </Stack>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}
