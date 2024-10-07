import { useMemo } from "react";

import { getShortStrategyLabel } from "metabase/admin/performance/utils";
import { EllipsifiedCollectionPath } from "metabase/common/components/EllipsifiedPath/EllipsifiedCollectionPath";
import { MaybeLink } from "metabase/components/Badge/Badge.styled";
import { Ellipsified } from "metabase/core/components/Ellipsified";
import Link from "metabase/core/components/Link";
import { getIcon } from "metabase/lib/icon";
import * as Urls from "metabase/lib/urls";
import { Box, Button, FixedSizeIcon, Flex } from "metabase/ui";
import type { CacheableModel } from "metabase-types/api";

import type { CacheableItem, UpdateTarget } from "../types";
import { getItemUrl } from "../utils";

import StrategyEditorForQuestionsAndDashboardsS from "./StrategyEditorForQuestionsAndDashboards.module.css";

export const TableRowForCacheableItem = ({
  item,
  forId,
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
    <tr
      className={
        currentTargetId !== null && currentTargetId === forId
          ? StrategyEditorForQuestionsAndDashboardsS.currentTarget
          : undefined
      }
    >
      <td>
        <MaybeLink
          className={StrategyEditorForQuestionsAndDashboardsS.ItemLink}
          to={url}
        >
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
            <Ellipsified style={{ fontWeight: "bold" }}>{name}</Ellipsified>
          </Flex>
        </MaybeLink>
      </td>
      <td>
        {collection && (
          <Link
            className={StrategyEditorForQuestionsAndDashboardsS.CollectionLink}
            to={Urls.collection(collection)}
          >
            <EllipsifiedCollectionPath collection={collection} />
          </Link>
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
    </tr>
  );
};
