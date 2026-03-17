import cx from "classnames";
import { type ReactNode, type Ref, forwardRef } from "react";

import { Box, Flex, UnstyledButton } from "metabase/ui";

import S from "./ParameterValueWidget.module.css";

export const ParameterValueWidgetTrigger = forwardRef(
  ParameterValueWidgetTriggerInner,
);

function ParameterValueWidgetTriggerInner(
  {
    children,
    hasValue,
    ariaLabel,
    className,
    mimicMantine = false,
    hasPopover = false,
  }: {
    children: ReactNode;
    hasValue: boolean;
    ariaLabel?: string;
    className?: string;
    mimicMantine?: boolean;
    hasPopover?: boolean;
  },
  ref: Ref<HTMLButtonElement | HTMLButtonElement>,
) {
  const attributes = hasPopover
    ? {
        // HACK: This is a hack to make typescript think we're rendering a button.
        // UnstyledButton's styles are widened somewhere down the stack so that they
        // are not compatible with Ref<HTMLButtonElement> and we need to cast it to "button"
        // to sidestep this issue.
        component: UnstyledButton as unknown as "button",
        ref: ref as Ref<HTMLButtonElement>,
        type: "button" as const,
      }
    : {
        component: "div" as const,
        ref: ref as Ref<HTMLDivElement>,
      };

  if (mimicMantine) {
    return (
      <Flex
        align="center"
        pos="relative"
        w="100%"
        className={cx(S.TriggerContainer, {
          [S.hasValue]: hasValue,
        })}
        aria-label={ariaLabel}
        {...attributes}
      >
        {children}
      </Flex>
    );
  }

  return (
    <Box
      className={cx(S.parameter, className, {
        [S.selected]: hasValue,
      })}
      aria-label={ariaLabel}
      maw="100%"
      {...attributes}
    >
      {children}
    </Box>
  );
}
