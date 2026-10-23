import type { ReactNode } from "react";

import {
  TimelineModal,
  TimelineModalLoadingState,
} from "metabase/timelines/common/components/TimelineModal";
import type { TimelineModalHeaderProps } from "metabase/timelines/common/components/TimelineModalHeader";

export interface TimelineQueryModalProps<T> {
  data: T | undefined;
  isLoading: boolean;
  error: unknown;
  /** Shown while loading, for modals whose title doesn't depend on `data`. */
  loadingTitle?: ReactNode;
  getHeaderProps: (data: T) => TimelineModalHeaderProps;
  children: (data: T) => ReactNode;
  onClose: () => void;
}

/**
 * A tall `TimelineModal` showing a spinner or the error until `data` has
 * loaded, then the header from `getHeaderProps` and the content from
 * `children`. The modal stays mounted through every state.
 */
export function TimelineQueryModal<T>({
  data,
  isLoading,
  error,
  loadingTitle,
  getHeaderProps,
  children,
  onClose,
}: TimelineQueryModalProps<T>) {
  const isLoaded = !isLoading && !error && data !== undefined;

  return (
    <TimelineModal
      tall
      animated={false}
      onClose={onClose}
      {...(isLoaded ? getHeaderProps(data) : { title: loadingTitle })}
    >
      {isLoaded ? (
        children(data)
      ) : (
        <TimelineModalLoadingState loading={isLoading} error={error} />
      )}
    </TimelineModal>
  );
}
