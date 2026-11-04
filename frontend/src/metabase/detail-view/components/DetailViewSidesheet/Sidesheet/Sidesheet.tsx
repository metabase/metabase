import cx from "classnames";
import type { ReactNode } from "react";
import { t } from "ttag";

import Animation from "metabase/css/core/animation.module.css";
import {
  ActionIcon,
  Group,
  Icon,
  Modal,
  Stack,
  Tooltip,
  rem,
} from "metabase/ui";

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
        px={0}
        transitionProps={{ duration: 0 }}
        w={rem(720)}
      >
        <Modal.Body className={S.body} p={0} pt="xl">
          <Group gap="lg" justify="flex-end" px="xxl">
            {actions}

            <Tooltip label={t`Close`}>
              <ActionIcon
                aria-label={t`Close`}
                size="sm"
                variant="subtle"
                onClick={onClose}
              >
                <Icon name="close" />
              </ActionIcon>
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
