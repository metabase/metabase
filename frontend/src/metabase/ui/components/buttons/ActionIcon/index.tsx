import {
  type ActionIconProps,
  ActionIcon as MantineActionIcon,
  createPolymorphicComponent,
} from "@mantine/core";
import { forwardRef } from "react";

export type { ActionIconGroupProps, ActionIconProps } from "@mantine/core";
export { actionIconOverrides } from "./ActionIcon.config";

type SizeVariantProps = Pick<ActionIconProps, "size" | "variant">;

const guardSubtleOnlyXs = ({
  size,
  variant,
}: SizeVariantProps): SizeVariantProps =>
  size === "xs" && variant !== undefined && variant !== "subtle"
    ? { size: "sm", variant }
    : { size, variant };

const ActionIconRoot = forwardRef<HTMLButtonElement, ActionIconProps>(
  function ActionIconRoot({ size, variant, ...props }, ref) {
    return (
      <MantineActionIcon
        {...props}
        {...guardSubtleOnlyXs({ size, variant })}
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
