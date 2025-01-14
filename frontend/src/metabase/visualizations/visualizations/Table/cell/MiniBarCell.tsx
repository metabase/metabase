import { Box } from "metabase/ui";

import styles from "./MiniBarCell.module.css";

interface MiniBarCellProps {
  value: number;
  extent: [number, number];
  options: Record<string, any>;
}

export const MiniBarCell = ({ value, extent, options }: MiniBarCellProps) => {
  const [min, max] = extent;
  const range = max - min;
  const width = range === 0 ? 0 : ((value - min) / range) * 100;

  return (
    <Box className={styles.wrapper}>
      <Box
        className={styles.bar}
        style={{
          width: `${width}%`,
          backgroundColor:
            options?.["mini_bar_colors"]?.[0] || "var(--color-brand)",
        }}
      />
      <Box className={styles.value}>{value}</Box>
    </Box>
  );
};
