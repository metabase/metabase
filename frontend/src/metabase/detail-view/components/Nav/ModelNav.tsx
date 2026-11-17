import cx from "classnames";
import { type ReactNode, useMemo } from "react";

import { skipToken, useGetCollectionQuery } from "metabase/api";
import { CollectionBadge } from "metabase/common/collections/components/CollectionBadge";
import {
  BREADCRUMB_TRAIL_CLASS_NAME,
  Breadcrumb,
} from "metabase/common/components/Breadcrumb";
import { Group, type GroupProps } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Card } from "metabase-types/api";

import { CollectionBreadcrumb } from "./CollectionBreadcrumb";
import { Separator } from "./Separator";
import { getCollectionList } from "./utils";

interface Props extends GroupProps {
  rowName: ReactNode;
  card: Card;
}

export const ModelNav = ({ rowName, card, className, ...props }: Props) => {
  const { data: collection } = useGetCollectionQuery(
    card.collection_id ? { id: card.collection_id } : skipToken,
  );

  const collections = useMemo(() => {
    return getCollectionList(collection);
  }, [collection]);

  return (
    <Group
      align="center"
      className={cx(BREADCRUMB_TRAIL_CLASS_NAME, className)}
      gap="sm"
      miw={0}
      wrap="nowrap"
      {...props}
    >
      {collections.map((collection) => (
        <CollectionBreadcrumb
          collectionId={collection.id}
          key={collection.id}
        />
      ))}

      {collection && (
        <>
          <CollectionBadge collectionId={collection.id} showTooltip />

          <Separator />
        </>
      )}

      <Breadcrumb icon="model" to={Urls.card(card)} showTooltip>
        {card.name}
      </Breadcrumb>

      <Separator />

      {rowName && <Breadcrumb showTooltip>{rowName}</Breadcrumb>}
    </Group>
  );
};
