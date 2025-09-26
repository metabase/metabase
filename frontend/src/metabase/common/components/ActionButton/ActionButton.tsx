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

import Button, { type ButtonProps } from "metabase/common/components/Button";
import ButtonsS from "metabase/css/components/buttons.module.css";
import CS from "metabase/css/core/index.css";
import type { CancellablePromise } from "metabase/lib/promise";
import { cancelable } from "metabase/lib/promise";
import { Center, Group, Icon, Loader } from "metabase/ui";

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
  successClassName?: string;
  failedClassName?: string;
  children?: React.ReactNode;
}

export type ActionButtonHandle = {
  resetState: () => void;
};

const ActionButton = forwardRef<ActionButtonHandle, ActionButtonProps>(
  function ActionButtonInner(
    {
      normalText = t`Save`,
      activeText = t`Saving...`,
      failedText = t`Save failed`,
      successText = t`Saved`,
      useLoadingSpinner = false,
      actionFn,
      className = ButtonsS.Button,
      successClassName = ButtonsS.ButtonSuccess, // not used
      failedClassName = ButtonsS.ButtonDanger, // not used
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

    return (
      <Button
        {...buttonProps}
        ref={innerRef}
        data-action-status={actionStatus}
        className={cx(className, {
          [successClassName]: result === "success",
          [failedClassName]: result === "failed",
          [CS.pointerEventsNone]: isActionDisabled,
        })}
        onClick={handleClick}
      >
        {active ? (
          useLoadingSpinner ? (
            <Center px="2rem">
              <Loader size="sm" color="white" data-testid="loading-indicator" />
            </Center>
          ) : (
            activeText
          )
        ) : result === "success" ? (
          <Group align="center" gap="sm">
            <Icon name="check" />
            <span>{successText}</span>
          </Group>
        ) : result === "failed" ? (
          failedText
        ) : (
          children || normalText
        )}
      </Button>
    );
  },
);

// eslint-disable-next-line import/no-default-export -- legacy usage
export default ActionButton;
