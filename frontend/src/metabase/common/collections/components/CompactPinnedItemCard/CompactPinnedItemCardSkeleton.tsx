import cx from "classnames";

import { EntityIcon } from "metabase/common/components/EntityIcon";
import { Card, Skeleton } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import S from "./CompactPinnedItemCard.module.css";

export function CompactPinnedItemCardSkeleton({ icon }: { icon: IconName }) {
  return (
    <Card
      className={cx(S.card, S.skeletonCard)}
      h="5rem"
      p={0}
      pos="relative"
      withBorder
    >
      <div className={S.body}>
        <EntityIcon
          name={icon}
          className={S.icon}
          size="1.25rem"
          color="core-brand"
        />
        <div className={S.content}>
          <Skeleton natural h="1rem" maw="8rem" />
          <Skeleton natural h="1rem" maw="12rem" />
        </div>
      </div>
    </Card>
  );
}
