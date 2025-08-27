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
  }: {
    children: ReactNode;
    hasValue: boolean;
    ariaLabel?: string;
    className?: string;
    mimicMantine?: boolean;
  },
  ref: Ref<HTMLButtonElement>,
) {
  if (mimicMantine) {
    return (
      <Flex
        align="center"
        pos="relative"
        component="button"
        type="button"
        w="100%"
        className={cx(S.TriggerContainer, {
          [S.hasValue]: hasValue,
        })}
        aria-label={ariaLabel}
        ref={ref}
      >
        {children}
      </Flex>
    );
  }

  return (
    <UnstyledButton
      ref={ref}
      type="button"
      className={cx(S.parameter, className, {
        [S.selected]: hasValue,
      })}
      aria-label={ariaLabel}
    >
      {children}
    </UnstyledButton>
  );
}
