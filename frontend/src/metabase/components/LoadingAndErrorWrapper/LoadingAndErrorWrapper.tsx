import cx from "classnames";
import type { ReactNode } from "react";
import { Children } from "react";
import { t } from "ttag";

import { ErrorComponent } from "metabase/components/LoadingAndErrorWrapper/ErrorComponent";
import { LoadingComponent } from "metabase/components/LoadingAndErrorWrapper/LoadingComponent";
import type { LoadingAndErrorWrapperProps } from "metabase/components/LoadingAndErrorWrapper/types";
import CS from "metabase/css/core/index.css";

const LoadingAndErrorWrapper = ({
  className,
  error = null,
  loading = false,
  noBackground = false,
  noWrapper = false,
  children,
  style,
  showSpinner = true,
  loadingMessages = [t`Loading...`],
  messageInterval = 6000,
  loadingScenes,
  renderError,
  "data-testid": dataTestId,
}: LoadingAndErrorWrapperProps) => {
  const getChildren = (child: ReactNode = children): ReactNode => {
    if (Array.isArray(child)) {
      return child.map(getChildren);
    } else if (typeof child === "function") {
      return child();
    } else {
      return child;
    }
  };

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
    return <>{Children.only(children)}</>;
  }

  const getInnerContent = () => {
    if (error) {
      return (
        <ErrorComponent
          className={contentClassName}
          error={error}
          renderError={renderError}
        />
      );
    }

    if (loading) {
      return (
        <LoadingComponent
          className={contentClassName}
          loadingScenes={loadingScenes}
          showSpinner={showSpinner}
          loadingMessages={loadingMessages}
          messageInterval={messageInterval}
        />
      );
    }

    return getChildren();
  };

  return (
    <div className={className} style={style} data-testid={dataTestId}>
      {getInnerContent()}
    </div>
  );
};

// eslint-disable-next-line import/no-default-export
export default LoadingAndErrorWrapper;
