import {
  CheckboxCard as MantineCheckboxCard,
  type CheckboxCardProps as MantineCheckboxCardProps,
  CheckboxIndicator as MantineCheckboxIndicator,
  Stack,
  Text,
  rem,
} from "@mantine/core";
import { type ReactNode, forwardRef } from "react";

import type { ColorName } from "metabase/ui/colors/types";

export type CheckboxCardProps = Omit<MantineCheckboxCardProps, "children"> & {
  label?: ReactNode;
  description?: ReactNode;
  withIndicator?: boolean;
  /**
   * Fills the checked indicator, e.g. to match a chart series: a palette
   * color name, or any CSS color.
   */
  indicatorColor?: ColorName | string;
};

// A picked color, e.g. "#509EE3", as opposed to a palette color name.
const CSS_COLOR_PATTERN = /^(#|rgb|hsl|var\()/;

export const CheckboxCard = forwardRef<HTMLButtonElement, CheckboxCardProps>(
  function CheckboxCard(
    {
      label,
      description,
      disabled,
      withIndicator = true,
      indicatorColor,
      ...props
    },
    ref,
  ) {
    // Palette names go through the theme, so they follow it; other CSS
    // colors set the variable the checked style reads.
    const isCssColor =
      indicatorColor !== undefined && CSS_COLOR_PATTERN.test(indicatorColor);
    // Not a CSS color, so a palette name; the prop's string type can't say so.
    const themeColor = isCssColor ? undefined : (indicatorColor as ColorName);
    const cssColorStyle = isCssColor
      ? { "--checkbox-color": indicatorColor }
      : undefined;
    return (
      <MantineCheckboxCard disabled={disabled} {...props} ref={ref}>
        {withIndicator && (
          <MantineCheckboxIndicator
            disabled={disabled}
            color={themeColor}
            style={cssColorStyle}
            mod={{ "with-color": indicatorColor != null }}
          />
        )}
        <Stack component="span" gap={rem(2)} miw={0}>
          {label && (
            <Text
              component="span"
              c={disabled ? "text-disabled" : "text-primary"}
              fw={700}
              lh={rem(18)}
            >
              {label}
            </Text>
          )}
          {description && (
            <Text
              component="span"
              size="sm"
              c={disabled ? "text-disabled" : "text-secondary"}
            >
              {description}
            </Text>
          )}
        </Stack>
      </MantineCheckboxCard>
    );
  },
);
