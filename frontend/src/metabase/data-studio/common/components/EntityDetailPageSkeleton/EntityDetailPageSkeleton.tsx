import { match } from "ts-pattern";

import {
  PageCardSkeleton,
  PageSkeleton,
} from "metabase/common/data-studio/components/PageSkeleton";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { Card, Skeleton, Stack } from "metabase/ui";

import { RevisionHistoryTimelineSkeleton } from "../RevisionHistory";

type EntityDetailPageSkeletonProps = {
  /** The tab being loaded, or `new` for the creation page, which has no tabs. */
  page: "new" | "definition" | "revisions" | "dependencies";
};

/**
 * Loading state for the segment and measure pages: the header with its
 * `EntityDetailTabs`, above the body of the page being loaded.
 */
export function EntityDetailPageSkeleton({
  page,
}: EntityDetailPageSkeletonProps) {
  const tabCount = PLUGIN_DEPENDENCIES.isEnabled ? 3 : 2;

  return (
    <PageSkeleton tabCount={page === "new" ? 0 : tabCount}>
      {match(page)
        .with("new", "definition", () => <DefinitionEditorSkeleton />)
        .with("revisions", () => <RevisionHistoryTimelineSkeleton />)
        .with("dependencies", () => <PageCardSkeleton />)
        .exhaustive()}
    </PageSkeleton>
  );
}

function DefinitionEditorSkeleton() {
  return (
    <Card withBorder p="xxl">
      <Stack gap="xxl">
        <Skeleton h={60} radius="md" />
        <Stack gap="sm">
          <Skeleton h={14} w={160} radius="xs" />
          <Skeleton h={56} maw={400} radius="sm" />
        </Stack>
      </Stack>
    </Card>
  );
}
