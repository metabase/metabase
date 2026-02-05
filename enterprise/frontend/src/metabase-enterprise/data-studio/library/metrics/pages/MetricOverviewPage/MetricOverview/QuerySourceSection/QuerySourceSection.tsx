import { Fragment, useMemo } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { useGetCardQuery, useGetTableQuery } from "metabase/api";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { getMetadata } from "metabase/selectors/metadata";
import { Group, Stack, Title } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { Card, CardId, TableId } from "metabase-types/api";

import S from "./QuerySourceInfo.module.css";

type QuerySourceSectionProps = {
  card: Card;
};

export function QuerySourceSection({ card }: QuerySourceSectionProps) {
  const metadata = useSelector(getMetadata);
  const { query, queryInfo } = useMemo(() => {
    const query = Lib.fromJsQueryAndMetadata(metadata, card.dataset_query);
    const queryInfo = Lib.queryDisplayInfo(query);
    return { query, queryInfo };
  }, [metadata, card]);

  const pickerInfo = useMemo(() => {
    const tableOrCardId = Lib.sourceTableOrCardId(query);
    const tableOrCard =
      tableOrCardId != null
        ? Lib.tableOrCardMetadata(query, tableOrCardId)
        : null;
    return tableOrCard != null ? Lib.pickerInfo(query, tableOrCard) : null;
  }, [query]);

  if (!queryInfo.isEditable || pickerInfo == null) {
    return null;
  }

  return (
    <Stack gap="sm">
      <Title order={6}>{t`Based on`}</Title>
      {pickerInfo.cardId == null ? (
        <TableSourcePath tableId={pickerInfo.tableId} />
      ) : (
        <CardSourcePath cardId={pickerInfo.cardId} />
      )}
    </Stack>
  );
}

type TableSourcePathProps = {
  tableId: TableId;
};

function TableSourcePath({ tableId }: TableSourcePathProps) {
  const { data: table } = useGetTableQuery({ id: tableId });

  const parts = useMemo(() => {
    if (!table || !table.db) {
      return null;
    }

    const pathParts: SourcePathPart[] = [];
    pathParts.push({
      name: table.db.name,
      url: table.db.is_audit
        ? undefined
        : Urls.dataStudioData({ databaseId: table.db_id }),
    });

    if (table.schema) {
      pathParts.push({
        name: table.schema,
        url: table.db.is_audit
          ? undefined
          : Urls.dataStudioData({
              databaseId: table.db_id,
              schemaName: table.schema,
            }),
      });
    }

    pathParts.push({
      name: table.display_name,
      url: table.db.is_audit
        ? undefined
        : Urls.dataStudioData({
            databaseId: table.db_id,
            schemaName: table.schema,
            tableId: table.id,
          }),
    });

    return pathParts;
  }, [table]);

  if (!parts) {
    return null;
  }

  return <SourcePath parts={parts} />;
}

type CardSourcePathProps = {
  cardId: CardId;
};

function CardSourcePath({ cardId }: CardSourcePathProps) {
  const { data: card } = useGetCardQuery({ id: cardId });

  const parts = useMemo(() => {
    if (card == null) {
      return null;
    }

    const pathParts: SourcePathPart[] = [
      { name: card.name, url: Urls.question(card) },
    ];

    const collection = card.collection;
    if (collection != null) {
      pathParts.unshift({
        name: collection.name,
        url: Urls.collection(collection),
      });

      if (collection.effective_ancestors != null) {
        pathParts.unshift(
          ...collection.effective_ancestors.map((parent) => ({
            name: parent.name,
            url: Urls.collection(parent),
          })),
        );
      }
    }

    return pathParts;
  }, [card]);

  if (!parts) {
    return null;
  }

  return <SourcePath parts={parts} />;
}

type SourcePathPart = {
  name: string;
  url?: string;
};

type SourcePathProps = {
  parts: SourcePathPart[];
};

function SourcePath({ parts }: SourcePathProps) {
  return (
    <Group gap="xs">
      {parts.map((part, index) => (
        <Fragment key={index}>
          {index > 0 && " / "}
          {part.url ? (
            <Link className={S.link} to={part.url}>
              {part.name}
            </Link>
          ) : (
            <span>{part.name}</span>
          )}
        </Fragment>
      ))}
    </Group>
  );
}
