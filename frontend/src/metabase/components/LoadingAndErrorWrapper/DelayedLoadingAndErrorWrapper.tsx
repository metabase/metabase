import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import LoadingAndErrorWrapper from "./LoadingAndErrorWrapper";

export type LoadingAndErrorWrapperProps = {
  className?: string;
  error: any;
  loading: any;
  /** Component that indicates that data is loading, for example a spinner */
  loader?: ReactNode;
  noBackground?: boolean;
  noWrapper?: boolean;
  children?: ReactNode;
  style?: object;
  showSpinner?: boolean;
  loadingMessages?: string[];
  messageInterval?: number;
  loadingScenes?: string[];
  renderError?: (error: any) => ReactNode;
  "data-testid"?: string;
};

/**
 * A loading/error display component that waits a bit before appearing
 * @see https://metaboat.slack.com/archives/C02H619CJ8K/p1709558533499399
 */
export const DelayedLoadingAndErrorWrapper = ({
  error,
  loading,
  delay = 300,
  loader,
  children,
  ...props
}: {
  delay?: number;
} & LoadingAndErrorWrapperProps) => {
  // If delay is zero show the wrapper immediately. Otherwise, apply a timeout
  const [showWrapper, setShowWrapper] = useState(delay === 0);

  props.loadingMessages ??= [];

  useEffect(() => {
    const timeout = setTimeout(() => {
      setShowWrapper(true);
    }, delay);
    return () => clearTimeout(timeout);
  }, [delay]);

  // Handle error condition
  if (error) {
    return <LoadingAndErrorWrapper error={error} {...props} />;
  }

  // Handle loading condition
  if (loading) {
    if (!showWrapper) {
      // Don't show the wrapper yet, but make tests aware that things are loading
      return <span data-testid="loading-indicator" />;
    }
    if (loader) {
      return loader;
    }
    return (
      <LoadingAndErrorWrapper error={error} loading={loading} {...props}>
        {children}
      </LoadingAndErrorWrapper>
    );
  }

  // Happy path
  return <>{children}</>;
};
