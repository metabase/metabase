import cx from "classnames";
import {
  type CSSProperties,
  Children,
  type ReactNode,
  forwardRef,
} from "react";
import { t } from "ttag";

import { findErrorMessage } from "metabase/api/utils/errors";
import {
  LoadingSkeleton,
  TextSkeleton,
} from "metabase/common/components/Skeletons";
import CS from "metabase/css/core/index.css";

export interface LoadingAndErrorWrapperProps {
  loading?: boolean;
  error?: any;
  noBackground?: boolean;
  noWrapper?: boolean;
  /**
   * Skeleton layout shown while loading, shaped like the content it stands in
   * for. It's wrapped in a `LoadingSkeleton`, so don't render one inside it.
   * Defaults to a generic paragraph skeleton.
   */
  loader?: ReactNode;
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
    loader,
    renderError: renderCustomError,
    style,
    className,
    "data-testid": testId,
    children,
  },
  ref,
) {
  function getErrorMessage() {
    const statusText =
      typeof error?.statusText === "string" ? error.statusText : undefined;
    return findErrorMessage(error) ?? statusText ?? t`An error occurred`;
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
        <LoadingSkeleton>
          {loader ?? <TextSkeleton withTitle lines={4} p="xl" />}
        </LoadingSkeleton>
      ) : (
        getChildren()
      )}
    </div>
  );
});
