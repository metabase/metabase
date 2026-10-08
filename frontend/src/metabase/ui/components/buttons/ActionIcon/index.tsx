import {
  ActionIcon as MantineActionIcon,
  type ActionIconProps as MantineActionIconProps,
  createPolymorphicComponent,
} from "@mantine/core";
import { forwardRef } from "react";

import type { ActionIconProps } from "./types";

export type { ActionIconGroupProps } from "@mantine/core";
export { actionIconOverrides } from "./ActionIcon.config";
export type { ActionIconColor, ActionIconProps } from "./types";

type SizeVariantProps = Pick<ActionIconProps, "size" | "variant">;

const guardSubtleOnlyXs = ({
  size,
  variant,
}: SizeVariantProps): SizeVariantProps =>
  size === "xs" && variant !== "subtle"
    ? { size: "sm", variant }
    : { size, variant };

const ActionIconRoot = forwardRef<HTMLButtonElement, ActionIconProps>(
  function ActionIconRoot({ size, variant, color, ...props }, ref) {
    return (
      <MantineActionIcon
        {...props}
        {...guardSubtleOnlyXs({ size, variant })}
        // `color` is overloaded with Figma color names that ActionIcon.config.tsx
        // resolves into button tokens, so it is not a Mantine color
        color={color as MantineActionIconProps["color"]}
        ref={ref}
      />
    );
  },
);

const ActionIconStaticComponents = {
  Group: MantineActionIcon.Group,
  GroupSection: MantineActionIcon.GroupSection,
};

export const ActionIcon = createPolymorphicComponent<
  "button",
  ActionIconProps,
  typeof ActionIconStaticComponents
>(Object.assign(ActionIconRoot, ActionIconStaticComponents));
