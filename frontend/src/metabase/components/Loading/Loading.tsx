import cx from "classnames";
import type { CSSProperties, ReactNode } from "react";
import { Children, useEffect, useState } from "react";
import { t } from "ttag";

import LoadingSpinner from "metabase/components/LoadingSpinner";
import CS from "metabase/css/core/index.css";
import { Box, Title } from "metabase/ui";

import type { CoreLoadingPropsVariant } from "./types";
import { getErrorAndLoading, getErrorMessage } from "./utils";

type DelayProps =
  | {
      /**
       * Whether to wait before showing the loading indicator
       * @see https://metaboat.slack.com/archives/C02H619CJ8K/p1709558533499399
       */
      delay?: true;
      delayLength?: number;
    }
  | { delay: false; delayLength: never };

export type LoadingProps = {
  /** Component that indicates that data is loading, for example a spinner */
  loader?: ReactNode;
  /** Component to show when the loading indicator is hidden. The default value
   * includes a data-testid attribute, to make tests aware that something is
   * loading */
  blankComponent?: ReactNode;
  className?: string;
  style?: CSSProperties;
  showSpinner?: boolean;
  renderError?: (error: any) => ReactNode;
  testId?: string;
  noWrapper?: boolean;
  noBackground?: boolean;
  children?: ReactNode | (() => ReactNode);
} & DelayProps &
  CoreLoadingPropsVariant;

/** Show a loading indicator, error message, or - if both loading and error are falsy - the children */
export const Loading = ({
  blankComponent = <span data-testid="loading-indicator" />,
  className,
  delay,
  delayLength = 300,
  loader,
  renderError,
  showSpinner = true,
  style,
  testId,
  noWrapper,
  noBackground,
  children,
  ...props
}: LoadingProps) => {
  const [error, loading] = getErrorAndLoading(props);

  // If there is no delay, show the wrapper immediately. Otherwise, apply a timeout
  const [isLoadingIndicatorShown, setIsLoadingIndicatorShown] = useState(
    !delay,
  );

  useEffect(() => {
    const timeout = setTimeout(() => {
      setIsLoadingIndicatorShown(true);
    }, delayLength);
    return () => clearTimeout(timeout);
  }, [delayLength]);

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

  const getChildren = (child = children): ReactNode => {
    if (Array.isArray(child)) {
      return child.map(getChildren);
    } else if (typeof child === "function") {
      return (child as () => ReactNode)();
    } else {
      return child;
    }
  };

  const renderErrorMessage = () =>
    renderError ? (
      <Box py="2rem">{renderError(getErrorMessage(error))}</Box>
    ) : (
      <div className={contentClassName}>
        <Title order={2} c={"var(--mb-color-text-light)"}>
          {getErrorMessage(error)}
        </Title>
      </div>
    );

  // Handle error condition
  if (error) {
    return (
      <div className={className} style={style} data-testid={testId}>
        {renderErrorMessage()}
      </div>
    );
  }

  // Handle loading condition
  else if (loading) {
    if (isLoadingIndicatorShown) {
      return (
        <div className={className} style={style} data-testid={testId}>
          {loader ?? (
            <DefaultLoadingIndicator
              showSpinner={showSpinner}
              message={t`Loading…`}
              contentClassName={contentClassName}
            />
          )}
        </div>
      );
    } else {
      return <>{blankComponent}</>;
    }
  }

  // Happy path
  else {
    const theChildren = getChildren();
    return theChildren ? Children.only(theChildren) : null;
  }
};

const DefaultLoadingIndicator = ({
  showSpinner,
  message,
  contentClassName,
}: {
  showSpinner?: boolean;
  message: string;
  contentClassName?: string;
}) => {
  return (
    <div className={contentClassName} data-testid="loading-indicator-wrapper">
      {showSpinner && <LoadingSpinner />}
      <h2 className={cx(CS.textNormal, CS.textLight, CS.mt1)}>{message}</h2>
    </div>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Loading;
