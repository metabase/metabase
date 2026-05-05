import cx from "classnames";
import {
  type HTMLAttributes,
  type ReactNode,
  type Ref,
  forwardRef,
} from "react";

import { Box, Flex, UnstyledButton } from "metabase/ui";

import S from "./ParameterValueWidget.module.css";

export const ParameterValueWidgetTrigger = forwardRef(
  ParameterValueWidgetTriggerInner,
);

type ParameterValueWidgetTriggerProps = {
  children: ReactNode;
  hasValue: boolean;
  ariaLabel?: string;
  className?: string;
  mimicMantine?: boolean;
  hasPopover?: boolean;
} & Omit<HTMLAttributes<HTMLElement>, "children">;

function ParameterValueWidgetTriggerInner(
  {
    children,
    hasValue,
    ariaLabel,
    className,
    mimicMantine = false,
    hasPopover = false,
    ...htmlProps
  }: ParameterValueWidgetTriggerProps,
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
        {...htmlProps}
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
      {...htmlProps}
      {...attributes}
    >
      {children}
    </Box>
  );
}
