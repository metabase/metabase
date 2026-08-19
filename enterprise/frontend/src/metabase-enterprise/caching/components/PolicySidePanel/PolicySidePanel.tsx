import type { ReactNode } from "react";
import { t } from "ttag";

import { ActionIcon, Flex, Group, Icon, Stack, Text } from "metabase/ui";

import S from "./PolicySidePanel.module.css";

type Props = {
  title: string;
  subtitle?: string;
  onPrevious?: () => void;
  onNext?: () => void;
  onClose: () => void;
  children: ReactNode;
};

export const PolicySidePanel = ({
  title,
  subtitle,
  onPrevious,
  onNext,
  onClose,
  children,
}: Props) => (
  <Flex
    component="aside"
    direction="column"
    className={S.panel}
    w="40rem"
    maw="50%"
    h="100%"
    bg="background_page-primary"
    aria-label={title}
    data-testid="cache-policy-panel"
  >
    <Group justify="space-between" px="2rem" pt="1.5rem">
      {(onPrevious !== undefined || onNext !== undefined) && (
        <Group gap="sm">
          <ActionIcon
            size="lg"
            c="text-secondary"
            bd="1px solid var(--mb-color-border-neutral)"
            disabled={onPrevious === undefined}
            aria-label={t`Previous item`}
            onClick={onPrevious}
          >
            <Icon name="chevronup" />
          </ActionIcon>
          <ActionIcon
            size="lg"
            c="text-secondary"
            bd="1px solid var(--mb-color-border-neutral)"
            disabled={onNext === undefined}
            aria-label={t`Next item`}
            onClick={onNext}
          >
            <Icon name="chevrondown" />
          </ActionIcon>
        </Group>
      )}
      <ActionIcon
        variant="subtle"
        c="text-secondary"
        size="lg"
        ml="auto"
        aria-label={t`Close`}
        onClick={onClose}
      >
        <Icon name="close" />
      </ActionIcon>
    </Group>
    <Stack gap={0} px="2rem" pt="xl" pb="md">
      {subtitle && (
        <Text size="sm" c="text-secondary">
          {subtitle}
        </Text>
      )}
      <Text fw="bold" fz="1.5rem" c="text-primary">
        {title}
      </Text>
    </Stack>
    <Flex direction="column" mih={0} px="2rem" pb="lg" flex="1">
      {children}
    </Flex>
  </Flex>
);
