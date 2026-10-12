import {
  CheckboxCard as MantineCheckboxCard,
  type CheckboxCardProps as MantineCheckboxCardProps,
  CheckboxIndicator as MantineCheckboxIndicator,
  Stack,
  Text,
  rem,
} from "@mantine/core";
import { type ReactNode, forwardRef } from "react";

export type CheckboxCardProps = Omit<MantineCheckboxCardProps, "children"> & {
  label?: ReactNode;
  description?: ReactNode;
  withIndicator?: boolean;
};

export const CheckboxCard = forwardRef<HTMLButtonElement, CheckboxCardProps>(
  function CheckboxCard(
    { label, description, disabled, withIndicator = true, ...props },
    ref,
  ) {
    return (
      <MantineCheckboxCard disabled={disabled} {...props} ref={ref}>
        {withIndicator && <MantineCheckboxIndicator disabled={disabled} />}
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
