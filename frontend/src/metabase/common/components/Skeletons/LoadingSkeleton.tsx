import type { ReactNode } from "react";
import { t } from "ttag";

import visuallyHidden from "metabase/css/core/visually-hidden.module.css";
import { Stack, type StackProps } from "metabase/ui";

export type LoadingSkeletonProps = StackProps & {
  children: ReactNode;
  "data-testid"?: string;
};

/**
 * Root of a loading skeleton. Marks the region busy, announces the loading
 * state to assistive tech, and carries the `loading-indicator` test id that
 * `waitForLoaderToBeRemoved` waits on. Render exactly one per loading region:
 * the skeleton layouts in this folder don't render one themselves.
 */
export function LoadingSkeleton({
  children,
  "data-testid": testId = "loading-indicator",
  ...props
}: LoadingSkeletonProps) {
  return (
    <Stack aria-busy data-testid={testId} {...props}>
      <span role="status" className={visuallyHidden.visuallyHidden}>
        {t`Loading...`}
      </span>
      {children}
    </Stack>
  );
}
