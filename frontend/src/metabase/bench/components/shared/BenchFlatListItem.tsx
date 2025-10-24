import cx from "classnames";
import type { LocationDescriptor } from "history";
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

interface BenchFlatListItemProps extends BenchFlatListItemContentProps {
  href: LocationDescriptor;
  isActive?: boolean;
}

export const BenchFlatListItem = ({
  href,
  isActive,

  label,
  icon,
  subtitle,
  thirdLine,
  rightGroup,
}: BenchFlatListItemProps) => {
  return (
    <NavLink
      component={Link}
      className={S.navLink}
      to={href}
      active={isActive}
      label={
        <BenchFlatListItemContent
          label={label}
          icon={icon}
          subtitle={subtitle}
          thirdLine={thirdLine}
          rightGroup={rightGroup}
        />
      }
    />
  );
};

interface BenchFlatListItemContentProps {
  label: ReactNode;
  icon: IconName;
  subtitle?: ReactNode;
  thirdLine?: ReactNode;
  rightGroup?: ReactNode;
  isActive?: boolean;
}

export const BenchFlatListItemContent = ({
  label,
  icon,
  subtitle,
  thirdLine,
  rightGroup,
  isActive,
}: BenchFlatListItemContentProps) => {
  const isOnlyLabel = !subtitle && !thirdLine;

  return (
    <Group
      className={cx(S.itemRoot, isActive && S.isActive)}
      gap="sm"
      align="flex-start"
      wrap="nowrap"
    >
      <FixedSizeIcon className={S.icon} size={16} name={icon} />
      <Stack className={S.content} gap="xs">
        <Ellipsified
          fw={isOnlyLabel ? "normal" : "bold"}
          size="md"
          lh="1rem"
          c="inherit"
          ignoreHeightTruncation
        >
          {label}
        </Ellipsified>
        {subtitle && (
          <Box className={S.subtitle}>
            {typeof subtitle === "string" ? (
              <Text size="sm" lh="1rem" c="inherit">
                {subtitle}
              </Text>
            ) : (
              subtitle
            )}
          </Box>
        )}

        {thirdLine}
      </Stack>
      {rightGroup}
    </Group>
  );
};
