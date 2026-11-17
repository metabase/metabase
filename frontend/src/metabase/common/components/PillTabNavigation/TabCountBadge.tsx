import { match } from "ts-pattern";

import { Badge, Skeleton } from "metabase/ui";
import { formatNumber } from "metabase/utils/formatting";

export type TabCountState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "loaded"; value: number };

type TabCountBadgeProps = {
  count: TabCountState;
  id?: string;
};

export function TabCountBadge({ count, id }: TabCountBadgeProps) {
  return match(count)
    .with({ status: "loading" }, () => (
      <Skeleton
        h={16}
        w="1.5rem"
        radius="xl"
        flex="none"
        data-testid="tab-count-skeleton"
      />
    ))
    .with({ status: "loaded" }, ({ value }) => (
      <Badge
        id={id}
        variant="light"
        size="xs"
        color="neutral"
        flex="none"
        data-testid="pill-tab-count"
      >
        {formatNumber(value)}
      </Badge>
    ))
    .with({ status: "error" }, () => null)
    .exhaustive();
}
