import type { ReactNode } from "react";
import { t } from "ttag";

import { ActionIcon, Flex, Group, Icon, Stack, Text, Title } from "metabase/ui";

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
    w="28.75rem"
    maw="50%"
    h="100%"
    bg="background_page-primary"
    aria-label={title}
    data-testid="cache-policy-panel"
  >
    <Group justify="space-between" px="2rem" pt="2rem">
      {(onPrevious !== undefined || onNext !== undefined) && (
        <Group gap="sm">
          <ActionIcon
            size="lg"
            className={S.navButton}
            disabled={onPrevious === undefined}
            aria-label={t`Previous item`}
            onClick={onPrevious}
          >
            <Icon name="chevronup" />
          </ActionIcon>
          <ActionIcon
            size="lg"
            className={S.navButton}
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
        c="icon-primary"
        size="lg"
        ml="auto"
        aria-label={t`Close`}
        onClick={onClose}
      >
        <Icon name="close" />
      </ActionIcon>
    </Group>
    <Stack gap={0} px="2rem" pt="xxl" pb="xxl">
      {subtitle && (
        <Text size="md" lh="1rem" fw="bold" c="text-secondary" mb="xxs">
          {subtitle}
        </Text>
      )}
      <Title order={3} c="text-primary">
        {title}
      </Title>
    </Stack>
    <Flex direction="column" mih={0} px="2rem" pb="xl" flex="1">
      {children}
    </Flex>
  </Flex>
);
