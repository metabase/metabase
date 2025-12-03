import type { ReactNode } from "react";

import { Box, type BoxProps, Icon, type IconName, Text } from "metabase/ui";

import S from "./TransformListItem.module.css";

type TransformListItemProps = {
  name: string;
  icon?: IconName;
  isActive?: boolean;
  isEdited?: boolean;
  menu?: ReactNode;
  onClick?: () => void;
} & BoxProps;

export const TransformListItem = ({
  name,
  icon = "database",
  isActive,
  isEdited,
  menu,
  onClick,
  ...props
}: TransformListItemProps) => {
  return (
    <Box className={S.root} onClick={onClick} {...props}>
      <Icon name={icon} size={14} c="brand" />
      <Text className={S.name} c={isActive ? "brand" : "text-dark"} truncate>
        {name}
      </Text>
      {isEdited && <Box className={S.statusDot} />}

      <Box className={S.menu} flex="0 0 auto">
        {menu}
      </Box>
    </Box>
  );
};
