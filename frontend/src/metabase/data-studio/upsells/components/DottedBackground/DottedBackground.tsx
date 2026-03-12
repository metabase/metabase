import cx from "classnames";

import { Box, type BoxProps } from "metabase/ui";

import styles from "./DottedBackground.module.css";

export interface DottedBackgroundProps
  extends Omit<BoxProps, "children" | "bg"> {
  /** The color for the dots. Defaults to brand color. */
  dotColor?: string;
  /** The opacity of the dots (0-1). Defaults to 0.2. */
  dotOpacity?: number;
  /** The spacing between dots. Defaults to 1rem. */
  dotSpacing?: string;
  /** The size of each dot. Defaults to 1px. */
  dotSize?: string;
  bg?: string;
  children?: React.ReactNode;
}

/**
 * A decorative component that renders a dotted pattern background.
 * Uses CSS radial gradients for crisp, scalable dots with theme support.
 *
 * @example
 * ```tsx
 * <DottedBackground p="xl">
 *   <Card>Content with dotted background</Card>
 * </DottedBackground>
 * ```
 */
export function DottedBackground({
  dotColor = "var(--mb-color-brand)",
  dotOpacity = 0.2,
  dotSpacing = "1rem",
  dotSize = "1px",
  bg = "var(--mb-color-background-secondary)",
  className,
  style,
  children,
  ...props
}: DottedBackgroundProps) {
  const patternColor = `color-mix(in srgb, ${dotColor}, transparent ${(1 - dotOpacity) * 100}%)`;

  return (
    <Box
      className={cx(styles.root, className)}
      style={{
        "--mb-dotted-bg-color": patternColor,
        "--mb-dotted-bg-spacing": dotSpacing,
        "--mb-dotted-bg-size": dotSize,
        "--mb-dotted-bg-background": bg,
        ...style,
      }}
      w="100%"
      h="100%"
      {...props}
    >
      {children}
    </Box>
  );
}
