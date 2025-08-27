import cx from "classnames";
import { type ReactNode, type Ref, forwardRef } from "react";

import { Flex, UnstyledButton } from "metabase/ui";

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
        component: "button" as const,
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
    <UnstyledButton
      className={cx(S.parameter, className, {
        [S.selected]: hasValue,
      })}
      aria-label={ariaLabel}
      {...attributes}
    >
      {children}
    </UnstyledButton>
  );
}
