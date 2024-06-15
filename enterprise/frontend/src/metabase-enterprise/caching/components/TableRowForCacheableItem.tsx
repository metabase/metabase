import { getShortStrategyLabel } from "metabase/admin/performance/utils";
import { Ellipsified } from "metabase/core/components/Ellipsified";
import { Button } from "metabase/ui";
import type { CacheableModel } from "metabase-types/api";

import type { UpdateTarget, CacheableItem } from "./types";

export const TableRowForCacheableItem = ({
  item,
  currentTargetId,
  currentTargetModel,
  updateTarget,
  isFormDirty,
}: {
  item: CacheableItem;
  forId: number;
  currentTargetId: number | null;
  currentTargetModel: CacheableModel | null;
  updateTarget: UpdateTarget;
  isFormDirty: boolean;
}) => {
  const { name, id, model, strategy } = item;
  const launchForm = () => {
    if (currentTargetId !== item.id || currentTargetModel !== item.model) {
      updateTarget({ id, model }, isFormDirty);
    }
  };
  const isCurrent = currentTargetId === id && currentTargetModel === model;
  return (
    <tr
      style={{
        backgroundColor: isCurrent
          ? "var(--mb-color-brand-lighter)"
          : undefined,
      }}
    >
      <td>
        <Ellipsified>{name}</Ellipsified>
      </td>
      <td>
        <Button variant="subtle" p={0} onClick={launchForm}>
          {getShortStrategyLabel(strategy)}
        </Button>
      </td>
    </tr>
  );
};
