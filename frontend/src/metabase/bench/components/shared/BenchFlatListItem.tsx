import type { ReactNode } from "react";
import { Link } from "react-router";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import {
  Box,
  FixedSizeIcon,
  Group,
  type IconName,
  NavLink,
  Stack,
  Text,
} from "metabase/ui";

import S from "./BenchFlatListItem.module.css";

interface BenchFlatListItemProps {
  label: ReactNode;
  icon: IconName;
  subtitle?: ReactNode;
  thirdLine?: ReactNode;

  href?: string;
  isActive?: boolean;
  rightGroup?: ReactNode;
}

export const BenchFlatListItem = ({
  label,
  icon,
  subtitle,
  thirdLine,
  href,
  isActive,
  rightGroup,
}: BenchFlatListItemProps) => {
  return (
    <NavLink
      component={Link}
      className={S.navLink}
      to={href}
      active={isActive}
      label={
        <Group className={S.itemRoot} gap="sm" align="flex-start" wrap="nowrap">
          <FixedSizeIcon className={S.icon} size={16} name={icon} />
          <Stack className={S.content} gap="sm">
            <Ellipsified
              fw="bold"
              size="md"
              lh="1rem"
              c="inherit"
              ignoreHeightTruncation
            >
              {label}
            </Ellipsified>
            <Box className={S.subtitle}>
              {typeof subtitle === "string" ? (
                <Text size="sm" lh="1rem" c="inherit">
                  {subtitle}
                </Text>
              ) : (
                subtitle
              )}
            </Box>

            {thirdLine}
          </Stack>
          {rightGroup}
        </Group>
      }
    />
  );
};
