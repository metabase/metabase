import cx from "classnames";
import type { ReactNode } from "react";
import { t } from "ttag";

import {
  Box,
  type BoxProps,
  Flex,
  Icon,
  type IconName,
  Skeleton,
  Text,
  Tooltip,
} from "metabase/ui";

import { StatusDot } from "../components/StatusDot/StatusDot";

import S from "./TransformListItem.module.css";

type TransformListItemProps = {
  name: string;
  icon?: IconName;
  isActive?: boolean;
  isEdited?: boolean;
  tooltipLabel?: string;
  menu?: ReactNode;
  onClick?: () => void;
} & BoxProps;

export const TransformListItem = ({
  name,
  icon = "database",
  isActive,
  isEdited,
  tooltipLabel,
  menu,
  onClick,
  ...props
}: TransformListItemProps) => {
  const label = (
    <Box className={cx(S.label, { [S.cursorPointer]: !tooltipLabel })}>
      <Icon name={icon} size={14} c="brand" />
      <Text c={isActive ? "brand" : "text-primary"} truncate>
        {name}
      </Text>
      {isEdited && (
        <Tooltip label={t`Unsaved changes`}>
          <Box>
            <StatusDot data-testid="status-dot" />
          </Box>
        </Tooltip>
      )}
    </Box>
  );

  return (
    <Box className={S.root} onClick={onClick} pl="sm" {...props}>
      {tooltipLabel ? (
        <Tooltip label={tooltipLabel} position="top">
          {label}
        </Tooltip>
      ) : (
        label
      )}

      <Box className={S.menu} flex="0 0 auto">
        {menu}
      </Box>
    </Box>
  );
};

export function TransformListItemSkeleton() {
  return (
    <Flex align="center" gap="sm" py="xs" px="sm" pl="md">
      <Skeleton h={14} w={14} circle />
      <Skeleton h={14} w="70%" />
    </Flex>
  );
}
