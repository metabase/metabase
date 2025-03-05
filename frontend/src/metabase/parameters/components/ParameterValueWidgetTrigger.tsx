import cx from "classnames";
import { type ReactNode, type Ref, forwardRef } from "react";

import { Flex } from "metabase/ui";

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
  ref: Ref<HTMLDivElement>,
) {
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
        ref={ref}
      >
        {children}
      </Flex>
    );
  }

  return (
    <div
      ref={ref}
      className={cx(S.parameter, className, {
        [S.selected]: hasValue,
      })}
      role="button"
      aria-label={ariaLabel}
    >
      {children}
    </div>
  );
}
