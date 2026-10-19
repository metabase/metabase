import type { ReactNode } from "react";
import { c, t } from "ttag";

import { Group, Icon, Modal, Stack, UnstyledButton } from "metabase/ui";

import S from "./TimelineModalHeader.module.css";

export interface TimelineModalHeaderProps {
  title: ReactNode;
  collectionName?: string;
  actions?: ReactNode;
  onGoBack?: () => void;
}

/**
 * The header of the timeline list and details modals, for use inside
 * `Modal.Content`: the standard title and close button, plus an optional back
 * button, collection path and actions.
 */
export const TimelineModalHeader = ({
  title,
  collectionName,
  actions,
  onGoBack,
}: TimelineModalHeaderProps) => (
  <Modal.Header className={S.header}>
    {onGoBack && (
      <UnstyledButton
        className={S.backButton}
        aria-label={t`Back`}
        onClick={onGoBack}
      >
        <Icon name="chevronleft" />
      </UnstyledButton>
    )}
    <Stack gap="xs" flex="1 1 auto" miw={0}>
      <Modal.Title
        className={onGoBack ? S.clickableTitle : undefined}
        onClick={onGoBack}
      >
        {title}
      </Modal.Title>
      {collectionName && (
        <Group gap="xxs">
          {c("Refers to: 'Events' in a collection").t`in`}
          <Icon name="folder" c="text-disabled" />
          {collectionName}
        </Group>
      )}
    </Stack>
    <Group gap="sm" wrap="nowrap">
      {actions}
      <Modal.CloseButton />
    </Group>
  </Modal.Header>
);
