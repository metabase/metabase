import cx from "classnames";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import type { CancellablePromise } from "metabase/lib/promise";
import { cancelable } from "metabase/lib/promise";
import { Button, type ButtonProps, Icon } from "metabase/ui";

export interface ActionButtonProps extends Omit<ButtonProps, "onClick"> {
  // need to expose this ref to allow Tooltip to bind to the correct element
  innerRef?: React.Ref<HTMLButtonElement>;
  normalText?: React.ReactNode;
  activeText?: React.ReactNode;
  failedText?: React.ReactNode;
  successText?: React.ReactNode;
  useLoadingSpinner?: boolean;
  actionFn: () => Promise<unknown>;
  className?: string;
  children?: React.ReactNode;
}

export type ActionButtonHandle = {
  resetState: () => void;
};

export const ActionButton = forwardRef<ActionButtonHandle, ActionButtonProps>(
  function ActionButtonInner(
    {
      normalText = t`Save`,
      activeText = t`Saving...`,
      failedText = t`Save failed`,
      successText = t`Saved`,
      useLoadingSpinner = false,
      actionFn,
      className = "",
      children,
      innerRef,
      ...buttonProps
    },
    ref,
  ) {
    const [active, setActive] = useState(false);
    const [result, setResult] = useState<null | "failed" | "success">(null);
    const timeout = useRef<null | ReturnType<typeof setTimeout>>(null);
    const actionPromise = useRef<CancellablePromise<unknown> | null>(null);

    const resetTimeout = () => {
      timeout.current && clearTimeout(timeout.current);
    };

    useEffect(() => {
      const promise = actionPromise.current;
      return () => {
        resetTimeout();
        if (promise) {
          promise?.cancel?.();
        }
      };
    }, [actionPromise]);

    const resetState = useCallback(() => {
      resetTimeout();
      setActive(false);
      setResult(null);
    }, []);

    // very rarely, we need to reset a button based on changes outside this button
    useImperativeHandle(ref, () => ({ resetState }), [resetState]);

    const resetStateOnTimeout = () => {
      // clear any previously set timeouts then start a new one
      resetTimeout();
      timeout.current = setTimeout(resetState, 5000);
    };

    const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();

      // set state to active
      setActive(true);
      setResult(null);

      // run the function we want bound to this button
      actionPromise.current = cancelable(actionFn());
      actionPromise.current.then(
        () => {
          setActive(false);
          setResult("success");
          resetStateOnTimeout();
        },
        (error: Error & { isCanceled?: boolean }) => {
          if (!error.isCanceled) {
            console.error(error);
            setActive(false);
            setResult("failed");
            resetStateOnTimeout();
          }
        },
      );
    };
    const isActionDisabled = active || result === "success";
    const actionStatus = active ? "pending" : (result ?? "idle");

    const color = match({ result })
      .with({ result: "success" }, () => "success")
      .with({ result: "failed" }, () => "danger")
      .otherwise(() => buttonProps.color || "brand");

    // success and failure are always "filled" variant
    const variant = match({ result })
      .with({ result: "success" }, () => "filled")
      .with({ result: "failed" }, () => "filled")
      .otherwise(() => buttonProps.variant || "filled");

    return (
      <Button
        loading={active && useLoadingSpinner}
        ref={innerRef}
        data-action-status={actionStatus}
        {...buttonProps}
        variant={variant}
        color={color}
        className={cx(className, {
          [CS.pointerEventsNone]: isActionDisabled,
        })}
        onClick={handleClick}
      >
        {active ? (
          activeText
        ) : result === "success" ? (
          <span>
            <Icon name="check" size={12} />
            <span className={CS.ml1}>{successText}</span>
          </span>
        ) : result === "failed" ? (
          failedText
        ) : (
          children || normalText
        )}
      </Button>
    );
  },
);
