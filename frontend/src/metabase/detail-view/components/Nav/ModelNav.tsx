import { type ReactNode, useMemo } from "react";

import {
  skipToken,
  useGetCardQuery,
  useGetCollectionQuery,
} from "metabase/api";
import * as Urls from "metabase/lib/urls";
import { Group, type GroupProps } from "metabase/ui";
import { getQuestionIdFromVirtualTableId } from "metabase-lib/v1/metadata/utils/saved-questions";
import type { Table } from "metabase-types/api";

import { Breadcrumb } from "./Breadcrumb";
import { CollectionBreadcrumb } from "./CollectionBreadcrumb";
import { Separator } from "./Separator";
import { getCollectionList } from "./utils";

interface Props extends GroupProps {
  rowName: ReactNode;
  table: Table;
}

export const ModelNav = ({ rowName, table, ...props }: Props) => {
  const modelId = getQuestionIdFromVirtualTableId(table.id);

  const { data: card } = useGetCardQuery(
    modelId == null ? skipToken : { id: modelId },
  );

  const { data: collection } = useGetCollectionQuery(
    card?.collection_id ? { id: card.collection_id } : skipToken,
  );

  const collections = useMemo(() => {
    return getCollectionList(collection);
  }, [collection]);

  return (
    <Group align="center" gap="sm" miw={0} wrap="nowrap" {...props}>
      {collections.map((collection) => (
        <CollectionBreadcrumb
          collectionId={collection.id}
          key={collection.id}
        />
      ))}

      {collection && (
        <>
          <Breadcrumb href={Urls.collection(collection)} icon="folder">
            {collection.name}
          </Breadcrumb>

          <Separator />
        </>
      )}

      {card && (
        <>
          <Breadcrumb href={Urls.question(card)} icon="model">
            {card.name}
          </Breadcrumb>

          <Separator />
        </>
      )}

      {rowName && <Breadcrumb>{rowName}</Breadcrumb>}
    </Group>
  );
};
