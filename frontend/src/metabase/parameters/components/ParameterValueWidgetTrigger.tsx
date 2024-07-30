import classnames from "classnames";
import { forwardRef, type ReactNode, type Ref } from "react";

import styles from "./ParameterValueWidget.module.css";
import { TriggerContainer } from "./ParameterValueWidgetTrigger.styled";

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
      <TriggerContainer aria-label={ariaLabel} ref={ref} hasValue={hasValue}>
        {children}
      </TriggerContainer>
    );
  }

  return (
    <div
      ref={ref}
      className={classnames(styles.parameter, className, {
        [styles.selected]: hasValue,
      })}
      role="button"
      aria-label={ariaLabel}
    >
      {children}
    </div>
  );
}
