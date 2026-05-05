import cx from "classnames";

import { Box, type BoxProps } from "metabase/ui";

import styles from "./LineDecorator.module.css";

export interface LineDecoratorProps extends BoxProps {
  children?: React.ReactNode;
}

/**
 * LineDecorator adds decorative gradient lines around its children.
 * The lines fade in and out at the edges, creating a subtle decorative border effect.
 */
export function LineDecorator({
  children,
  className,
  ...props
}: LineDecoratorProps) {
  return (
    <Box className={cx(styles.root, className)} {...props}>
      {["top", "right", "bottom", "left"].map((position) => (
        <Box
          key={position}
          className={styles.border}
          data-position={position}
        />
      ))}
      {children}
    </Box>
  );
}
