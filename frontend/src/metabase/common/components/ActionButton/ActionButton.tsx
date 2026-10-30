import cx from "classnames";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { Button, type ButtonProps, Center, Icon, Loader } from "metabase/ui";

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
      className,
      children,
      innerRef,
      ...buttonProps
    },
    ref,
  ) {
    const [active, setActive] = useState(false);
    const [result, setResult] = useState<null | "failed" | "success">(null);
    const timeout = useRef<null | ReturnType<typeof setTimeout>>(null);
    const isMountedRef = useRef(true);
    const latestActionIdRef = useRef(0);

    const resetTimeout = () => {
      if (timeout.current) {
        clearTimeout(timeout.current);
      }
    };

    useEffect(() => {
      isMountedRef.current = true;
      return () => {
        isMountedRef.current = false;
        resetTimeout();
      };
    }, []);

    const resetState = useCallback(() => {
      // a reset wins over the result of an action that is still running
      latestActionIdRef.current += 1;
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
      latestActionIdRef.current += 1;
      const actionId = latestActionIdRef.current;
      const shouldShowResult = () =>
        isMountedRef.current && actionId === latestActionIdRef.current;

      // run the function we want bound to this button
      actionFn().then(
        () => {
          if (shouldShowResult()) {
            setActive(false);
            setResult("success");
            resetStateOnTimeout();
          }
        },
        (error: Error) => {
          console.error(error);
          if (shouldShowResult()) {
            setActive(false);
            setResult("failed");
            resetStateOnTimeout();
          }
        },
      );
    };
    const isActionDisabled = active || result === "success";
    const actionStatus = active ? "pending" : (result ?? "idle");
    const resultProps: Partial<ButtonProps> =
      result === "success"
        ? {
            variant: "filled",
            color: "positive",
            leftSection: <Icon name="check" />,
          }
        : result === "failed"
          ? { variant: "filled", color: "negative" }
          : {};

    return (
      <Button
        {...buttonProps}
        {...resultProps}
        ref={innerRef}
        data-action-status={actionStatus}
        className={cx(className, {
          [CS.pointerEventsNone]: isActionDisabled,
        })}
        onClick={handleClick}
      >
        {active ? (
          useLoadingSpinner ? (
            <Center px="2rem">
              <Loader size="sm" color="core-white" />
            </Center>
          ) : (
            activeText
          )
        ) : result === "success" ? (
          successText
        ) : result === "failed" ? (
          failedText
        ) : (
          children || normalText
        )}
      </Button>
    );
  },
);
