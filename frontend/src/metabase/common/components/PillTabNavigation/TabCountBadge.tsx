import { match } from "ts-pattern";

import { Badge, Skeleton } from "metabase/ui";

export type TabCountState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "loaded"; value: number };

export function TabCountBadge({ count }: { count: TabCountState }) {
  return match(count)
    .with({ status: "loading" }, () => (
      <Skeleton
        h={16}
        miw="1.5rem"
        radius="xl"
        data-testid="tab-count-skeleton"
      />
    ))
    .with({ status: "loaded" }, ({ value }) => (
      <Badge variant="light" size="xs" color="neutral">
        {value}
      </Badge>
    ))
    .with({ status: "error" }, () => null)
    .exhaustive();
}
