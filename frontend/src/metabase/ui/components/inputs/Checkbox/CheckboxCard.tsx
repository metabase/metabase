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
  /** Fills the checked indicator, e.g. to match a chart series. */
  indicatorColor?: ColorName;
};

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
    return (
      <MantineCheckboxCard disabled={disabled} {...props} ref={ref}>
        {withIndicator && (
          <MantineCheckboxIndicator
            disabled={disabled}
            color={indicatorColor}
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
