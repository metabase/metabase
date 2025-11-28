import { Box, Icon, Text } from "metabase/ui";

import styles from "./TransformListItem.module.css";

type TransformListItemProps = {
  name: string;
  isActive?: boolean;
  isEdited?: boolean;
  onClick?: () => void;
};

export const TransformListItem = ({
  name,
  isActive,
  isEdited,
  onClick,
}: TransformListItemProps) => {
  return (
    <Box className={styles.root} onClick={onClick}>
      <Icon name="database" size={14} c="var(--mb-color-brand)" />
      <Text
        className={styles.name}
        c={isActive ? "var(--mb-color-brand)" : "text-dark"}
        truncate
        fw={600}
      >
        {name}
      </Text>
      {isEdited && <Box className={styles.statusDot} />}
    </Box>
  );
};
