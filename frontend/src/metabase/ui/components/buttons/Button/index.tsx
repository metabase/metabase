import {
  Button as MantineButton,
  type ButtonProps as MantineButtonProps,
  createPolymorphicComponent,
} from "@mantine/core";
import { type ButtonHTMLAttributes, forwardRef } from "react";

export type { ButtonGroupProps } from "@mantine/core";
export { buttonOverrides } from "./Button.config";

export type ButtonSize = "sm" | "md" | "lg" | "compact-sm" | "compact-md";

export type ButtonVariant =
  | "default"
  | "filled"
  | "light"
  | "subtle"
  | "transparent"
  | "on-dark-primary"
  | "on-dark-secondary";

export type ButtonColor =
  | "brand"
  | "filter"
  | "negative"
  | "positive"
  | "warning"
  | "neutral";

export type ButtonProps = Omit<
  MantineButtonProps,
  "size" | "variant" | "color"
> & {
  size?: ButtonSize;
  variant?: ButtonVariant;
  color?: ButtonColor;
} & ButtonHTMLAttributes<HTMLButtonElement>;

type SizeVariantProps = Pick<ButtonProps, "size" | "variant">;

const guardTransparentInvariant = ({
  size,
  variant,
}: SizeVariantProps): SizeVariantProps => {
  if (size === "compact-sm" || size === "compact-md") {
    return { size, variant: "transparent" };
  }
  if (variant === "transparent") {
    return { size: "compact-md", variant };
  }
  return { size, variant };
};

const ButtonRoot = forwardRef<HTMLButtonElement, ButtonProps>(
  function ButtonRoot({ size, variant, color, ...props }, ref) {
    return (
      <MantineButton
        {...props}
        {...guardTransparentInvariant({ size, variant })}
        // `color` is overloaded with Figma color names that Button.config.tsx
        // resolves into button tokens, so it is not a Mantine color
        color={color as MantineButtonProps["color"]}
        ref={ref}
      />
    );
  },
);

const ButtonStaticComponents = { Group: MantineButton.Group };

export const Button = createPolymorphicComponent<
  "button",
  ButtonProps,
  typeof ButtonStaticComponents
>(Object.assign(ButtonRoot, ButtonStaticComponents));
