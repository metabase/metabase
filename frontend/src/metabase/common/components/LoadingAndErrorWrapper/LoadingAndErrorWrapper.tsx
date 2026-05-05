import { useInterval } from "@mantine/hooks";
import cx from "classnames";
import {
  type CSSProperties,
  Children,
  type ReactNode,
  forwardRef,
  useEffect,
  useState,
} from "react";
import { t } from "ttag";

import { LoadingSpinner } from "metabase/common/components/LoadingSpinner";
import CS from "metabase/css/core/index.css";

export interface LoadingAndErrorWrapperProps {
  loading?: boolean;
  error?: any;
  noBackground?: boolean;
  noWrapper?: boolean;
  showSpinner?: boolean;
  getLoadingMessages?: () => string[];
  messageInterval?: number;
  renderError?: (message?: string) => ReactNode;
  style?: CSSProperties;
  className?: string;
  "data-testid"?: string;

  children?: ReactNode | (() => ReactNode);
}

export const LoadingAndErrorWrapper = forwardRef<
  HTMLDivElement,
  LoadingAndErrorWrapperProps
>(function LoadingAndErrorWrapperInner(
  {
    loading = false,
    error,
    noBackground = true,
    noWrapper = false,
    showSpinner = true,
    getLoadingMessages = () => [t`Loading...`],
    messageInterval = 6000,
    renderError: renderCustomError,
    style,
    className,
    "data-testid": testId,
    children,
  },
  ref,
) {
  const [messageIndex, setMessageIndex] = useState(0);

  const loadingInterval = () => {
    if (loading) {
      setMessageIndex(
        (oldIndex) => (oldIndex + 1) % getLoadingMessages().length,
      );
    }
  };
  const interval = useInterval(loadingInterval, messageInterval);
  useEffect(() => {
    if (getLoadingMessages().length > 1) {
      interval.start();
    }
    return interval.stop;
  });

  function getErrorMessage() {
    let errorMessage =
      // NOTE Atte Keinänen 5/10/17 Dashboard API endpoint returns the error as JSON with `message` field
      error &&
      ((error.data?.message ? error.data.message : error.data) ||
        error.statusText ||
        error.message ||
        error);

    if (!errorMessage || typeof errorMessage !== "string") {
      errorMessage = t`An error occurred`;
    }
    return errorMessage;
  }

  function renderError(contentClassName: string) {
    if (renderCustomError) {
      return (
        <div className={CS.py4}>{renderCustomError(getErrorMessage())}</div>
      );
    }

    return (
      <div className={contentClassName}>
        <h2 className={cx(CS.textNormal, CS.textLight, CS.ieWrapContentFix)}>
          {getErrorMessage()}
        </h2>
      </div>
    );
  }

  function getChildren(child = children): ReactNode {
    if (Array.isArray(child)) {
      return child.map(getChildren);
    } else if (typeof child === "function") {
      return child();
    } else {
      return child;
    }
  }

  const contentClassName = cx(
    CS.wrapper,
    CS.py4,
    CS.textBrand,
    CS.textCentered,
    CS.flexFull,
    CS.flex,
    CS.flexColumn,
    CS.layoutCentered,
    { [CS.bgWhite]: !noBackground },
  );

  if (noWrapper && !error && !loading) {
    const children = getChildren();
    // special case for loading wrapper with null/undefined child
    if (children == null) {
      return null;
    }
    return Children.only(children);
  }
  return (
    <div className={className} style={style} data-testid={testId} ref={ref}>
      {error ? (
        renderError(contentClassName)
      ) : loading ? (
        <div className={contentClassName}>
          {showSpinner && <LoadingSpinner />}
          <h2 className={cx(CS.textNormal, CS.textLight, CS.mt1)}>
            {getLoadingMessages()[messageIndex]}
          </h2>
        </div>
      ) : (
        getChildren()
      )}
    </div>
  );
});
