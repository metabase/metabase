import type { ReactNode } from "react";
import { Link } from "react-router";

import type { IconName } from "metabase/ui";
import { ActionIcon, Box, Flex, Icon, Stack, Text } from "metabase/ui";

import S from "./ModelingSidebarSection.module.css";

interface ModelingSidebarSectionProps {
  icon: IconName;
  title: string;
  children?: ReactNode;
  to?: string;
  isActive?: boolean;
  action?: {
    icon: IconName;
    label: string;
    onClick: () => void;
  };
  actionTarget?: ReactNode;
}

export function ModelingSidebarSection({
  icon,
  title,
  children,
  to,
  isActive = false,
  action,
  actionTarget,
}: ModelingSidebarSectionProps) {
  const actionButton = action && (
    <ActionIcon
      size="sm"
      variant="subtle"
      aria-label={action.label}
      onClick={(e) => {
        if (to) {
          e.preventDefault();
          e.stopPropagation();
        }
        action.onClick();
      }}
      ml="auto"
    >
      <Icon name={action.icon} size={16} />
    </ActionIcon>
  );

  const titleContent = (
    <Flex
      align="center"
      gap="sm"
      px="sm"
      c={isActive ? "text-hover" : "text-primary"}
    >
      <Icon name={icon} size={16} />
      <Text size="lg" fw="bold" className={S.titleText}>
        {title}
      </Text>
      {actionTarget || actionButton}
    </Flex>
  );

  const titleWrapper = to ? (
    <Box
      component={Link}
      to={to}
      py="xs"
      className={S.sectionLink}
      data-active={isActive || undefined}
    >
      {titleContent}
    </Box>
  ) : (
    <Box py="xs">{titleContent}</Box>
  );

  return (
    <Stack gap="sm">
      {titleWrapper}
      {children}
    </Stack>
  );
}
