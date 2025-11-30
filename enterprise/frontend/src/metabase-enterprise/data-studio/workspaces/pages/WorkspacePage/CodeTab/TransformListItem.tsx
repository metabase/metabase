import { Box, type BoxProps, Icon, type IconName, Text } from "metabase/ui";

import styles from "./TransformListItem.module.css";

type TransformListItemProps = {
  name: string;
  icon?: IconName;
  isActive?: boolean;
  isEdited?: boolean;
  onClick?: () => void;
} & BoxProps;

export const TransformListItem = ({
  name,
  icon = "database",
  isActive,
  isEdited,
  onClick,
  ...props
}: TransformListItemProps) => {
  return (
    <Box className={styles.root} onClick={onClick} {...props}>
      <Icon name={icon} size={14} c="var(--mb-color-brand)" />
      <Text
        className={styles.name}
        c={isActive ? "var(--mb-color-brand)" : "text-dark"}
        truncate
      >
        {name}
      </Text>
      {isEdited && <Box className={styles.statusDot} />}
    </Box>
  );
};
