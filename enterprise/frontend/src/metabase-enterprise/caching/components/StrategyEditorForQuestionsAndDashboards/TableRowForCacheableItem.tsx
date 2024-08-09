import { useMemo } from "react";

import { getShortStrategyLabel } from "metabase/admin/performance/utils";
import { CollectionBreadcrumbsWithTooltip } from "metabase/browse/components/CollectionBreadcrumbsWithTooltip";
import { CollectionMaybeLink } from "metabase/browse/components/CollectionBreadcrumbsWithTooltip.styled";
import { Ellipsified } from "metabase/core/components/Ellipsified";
import { getIcon } from "metabase/lib/icon";
import { Box, Flex, FixedSizeIcon, Button } from "metabase/ui";
import type { CacheableModel } from "metabase-types/api";

import type { UpdateTarget, CacheableItem } from "../types";
import { getItemUrl } from "../utils";

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

  const url = useMemo(
    () => getItemUrl(model, item as { id: number; name: string }) || undefined,
    [model, item],
  );

  const launchForm = () => {
    if (currentTargetId !== item.id || currentTargetModel !== item.model) {
      updateTarget({ id, model }, isFormDirty);
    }
  };
  return (
    <Box component="tr">
      <td>
        <CollectionMaybeLink to={url}>
          <Flex
            align="center"
            wrap="nowrap"
            gap="sm"
            style={{ overflow: "hidden" }}
          >
            {iconName ? (
              <FixedSizeIcon name={iconName} />
            ) : (
              <Box h="sm" w="md" />
            )}
            <Ellipsified fw="bold">{name}</Ellipsified>
          </Flex>
        </CollectionMaybeLink>
      </td>
      <td>
        {collection && (
          <CollectionBreadcrumbsWithTooltip
            containerName={`mb-breadcrumbs-for-${id}`}
            collection={collection}
          />
        )}
      </td>
      <td>
        <Button
          variant="subtle"
          onClick={() => launchForm()}
          p={0}
          fw="bold"
          c="var(--mb-color-brand)"
        >
          {getShortStrategyLabel(strategy)}
        </Button>
      </td>
    </Box>
  );
};
