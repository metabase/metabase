import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { match } from "ts-pattern";

import { Transition } from "metabase/ui";

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
  blankComponent = null,
  loader,
  children,
  ...props
}: {
  delay?: number;
  /** This is shown during the delay if `loading` is true */
  blankComponent?: ReactNode;
} & LoadingAndErrorWrapperProps) => {
  // If delay is zero show the wrapper immediately. Otherwise, apply a timeout
  const [showWrapper, setShowWrapper] = useState(delay === 0);

  // FIXME: remove this
  loading ||= (window as { stayLoading?: boolean }).stayLoading;

  props.loadingMessages ??= [];

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const win = window as {
        stayLoading?: boolean;
        noNaturalSkeletons?: boolean;
      };
      match([e.ctrlKey, e.key])
        .with([true, "n"], () => {
          // eslint-disable-next-line no-console
          console.log("toggling natural skeletons");
          win.noNaturalSkeletons = !win.noNaturalSkeletons;
        })
        .with([true, "l"], () => {
          // eslint-disable-next-line no-console
          console.log("toggling permanent loading state");
          win.stayLoading = !win.stayLoading;
        });
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setShowWrapper(true);
    }, delay);
    return () => clearTimeout(timeout);
  }, [delay]);

  if (!loading && !error) {
    return <>{children}</>;
  }
  if (!showWrapper) {
    return <>{blankComponent}</>;
  }
  return (
    <Transition
      mounted={!!(error || loading)}
      transition="fade"
      duration={200}
      timingFunction="ease"
    >
      {styles => (
        <div style={styles}>
          {loader ?? (
            <LoadingAndErrorWrapper error={error} loading={loading} {...props}>
              {children}
            </LoadingAndErrorWrapper>
          )}
        </div>
      )}
    </Transition>
  );
};
