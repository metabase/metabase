import { getShortStrategyLabel } from "metabase/admin/performance/utils";
import { CollectionBreadcrumbsWithTooltip } from "metabase/browse/components/CollectionBreadcrumbsWithTooltip";
import { Ellipsified } from "metabase/core/components/Ellipsified";
import { getIcon } from "metabase/lib/icon";
import { Box, Flex, FixedSizeIcon, Text } from "metabase/ui";
import type { CacheableModel } from "metabase-types/api";

import type { UpdateTarget, CacheableItem } from "../types";

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
  const { name, id, collection, model, strategy, iconModel } = item;
  const iconName = iconModel
    ? getIcon({ model: iconModel || "card" }).name
    : null;

  const launchForm = () => {
    if (currentTargetId !== item.id || currentTargetModel !== item.model) {
      updateTarget({ id, model }, isFormDirty);
    }
  };
  const isCurrent = currentTargetId === id && currentTargetModel === model;
  return (
    <Box
      component="tr"
      bg={isCurrent ? "var(--mb-color-brand-lighter)" : undefined}
      onClick={launchForm}
      style={{ cursor: "pointer" }}
    >
      <td>
        <Flex
          align="center"
          wrap="nowrap"
          gap="sm"
          style={{ overflow: "hidden" }}
        >
          {iconName ? <FixedSizeIcon name={iconName} /> : <Box h="sm" w="md" />}
          <Ellipsified fw="bold">{name}</Ellipsified>
        </Flex>
      </td>
      <td>
        {collection && (
          <CollectionBreadcrumbsWithTooltip
            containerName={`mb-breadcrumbs-for-${id}`}
            collection={collection}
            isLink={false}
          />
        )}
      </td>
      <td>
        <Text fw="bold" c="var(--mb-color-brand)">
          {getShortStrategyLabel(strategy)}
        </Text>
      </td>
    </Box>
  );
};
