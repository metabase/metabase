import type { ReactNode } from "react";
import { Link } from "react-router";

import type { IconName } from "metabase/ui";
import { Box, FixedSizeIcon, Flex, Stack, Text } from "metabase/ui";

import S from "./ModelingSidebarSection.module.css";

interface ModelingSidebarSectionProps {
  icon: IconName;
  title: string;
  children?: ReactNode;
  to?: string;
  onClick?: () => void;
  isActive?: boolean;
  action?: {
    icon: IconName;
    label: string;
    onClick: () => void;
  };
  rightSection?: ReactNode;
}

export function ModelingSidebarSection({
  icon,
  title,
  children,
  to,
  onClick,
  isActive = false,
  rightSection = null,
}: ModelingSidebarSectionProps) {
  const titleContent = (
    <Flex align="center" gap="sm" px="sm" py="xs">
      <FixedSizeIcon name={icon} size={16} />
      <Text fw="bold" className={S.titleText}>
        {title}
      </Text>
      {rightSection}
    </Flex>
  );

  const titleWrapper = to ? (
    <Box
      component={Link}
      to={to}
      className={S.sectionLink}
      data-active={isActive || undefined}
    >
      {titleContent}
    </Box>
  ) : onClick ? (
    <Box
      onClick={onClick}
      className={S.sectionLink}
      data-active={isActive || undefined}
    >
      {titleContent}
    </Box>
  ) : (
    <Box>{titleContent}</Box>
  );

  return (
    <Stack gap="sm">
      {titleWrapper}
      {children}
    </Stack>
  );
}
