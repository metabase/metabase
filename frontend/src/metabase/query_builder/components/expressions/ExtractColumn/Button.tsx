import { Text, Box } from "metabase/ui";

import styles from "./Button.module.css";

export function Button({
  title,
  example,
  onClick,
}: {
  title: string;
  example: string;
  onClick: () => void;
}) {
  return (
    <Box
      component="button"
      type="button"
      p="sm"
      className={styles.button}
      onClick={onClick}
    >
      <Text color="text-dark" className={styles.content} weight="bold" p={0}>
        {title}
      </Text>
      <Text color="text-light" size="sm" className={styles.content}>
        {example}
      </Text>
    </Box>
  );
}
