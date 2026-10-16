import {
  RadioCard as MantineRadioCard,
  type RadioCardProps as MantineRadioCardProps,
  RadioIndicator as MantineRadioIndicator,
  Stack,
  Text,
  rem,
} from "@mantine/core";
import { type ReactNode, forwardRef } from "react";

export type RadioCardProps = Omit<MantineRadioCardProps, "children"> & {
  label?: ReactNode;
  description?: ReactNode;
  leftSection?: ReactNode;
  disabled?: boolean;
  withIndicator?: boolean;
};

export const RadioCard = forwardRef<HTMLButtonElement, RadioCardProps>(
  function RadioCard(
    {
      label,
      description,
      leftSection,
      disabled,
      withIndicator = true,
      ...props
    },
    ref,
  ) {
    return (
      <MantineRadioCard disabled={disabled} {...props} ref={ref}>
        {withIndicator && <MantineRadioIndicator disabled={disabled} />}
        {leftSection}
        <Stack component="span" gap={rem(4)} miw={0}>
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
      </MantineRadioCard>
    );
  },
);
