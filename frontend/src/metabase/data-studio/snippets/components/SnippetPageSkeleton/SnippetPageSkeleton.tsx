import {
  PageSkeleton,
  type PageSkeletonProps,
} from "metabase/common/data-studio/components/PageSkeleton";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";

/** Loading state for a snippet page: the `SnippetHeader` and the page body. */
export function SnippetPageSkeleton(
  props: Omit<PageSkeletonProps, "tabCount">,
) {
  // Definition, plus Dependencies when enabled.
  const tabCount = PLUGIN_DEPENDENCIES.isEnabled ? 2 : 1;

  return <PageSkeleton tabCount={tabCount} {...props} />;
}
