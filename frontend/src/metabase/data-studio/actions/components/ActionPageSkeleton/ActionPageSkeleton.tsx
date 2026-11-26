import {
  PageSkeleton,
  type PageSkeletonProps,
} from "metabase/common/data-studio/components/PageSkeleton";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";

type ActionPageSkeletonProps = Omit<PageSkeletonProps, "tabCount"> & {
  /** The edit page's header has no tabs. */
  isEditMode?: boolean;
};

/** Loading state for an action page: the `ActionHeader` and the page body. */
export function ActionPageSkeleton({
  isEditMode = false,
  ...props
}: ActionPageSkeletonProps) {
  // Definition, Fields, Run, and Settings, plus Dependencies when enabled.
  const tabCount = PLUGIN_DEPENDENCIES.isEnabled ? 5 : 4;

  return <PageSkeleton tabCount={isEditMode ? 0 : tabCount} {...props} />;
}
