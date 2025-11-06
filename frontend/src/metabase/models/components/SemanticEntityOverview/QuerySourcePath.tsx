import { Fragment, useMemo } from "react";
import { Link } from "react-router";

import { useGetCardQuery, useGetTableQuery } from "metabase/api";
import * as Urls from "metabase/lib/urls";
import { Anchor, Box } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { CardId, TableId } from "metabase-types/api";

type QuerySourcePathProps = {
  query: Lib.Query;
};

export function QuerySourcePath({ query }: QuerySourcePathProps) {
  const pickerInfo = useMemo(() => {
    const tableOrCardId = Lib.sourceTableOrCardId(query);
    const tableOrCard =
      tableOrCardId != null
        ? Lib.tableOrCardMetadata(query, tableOrCardId)
        : null;
    return tableOrCard != null ? Lib.pickerInfo(query, tableOrCard) : null;
  }, [query]);

  if (pickerInfo == null) {
    return null;
  }

  if (pickerInfo.cardId == null) {
    return <TableSourcePath tableId={pickerInfo.tableId} />;
  } else {
    return <CardSourcePath cardId={pickerInfo.cardId} />;
  }
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
      url: table.db.is_audit ? undefined : Urls.dataModelDatabase(table.db_id),
    });

    if (table.schema) {
      pathParts.push({
        name: table.schema,
        url: table.db.is_audit
          ? undefined
          : Urls.dataModelSchema(table.db_id, table.schema),
      });
    }

    pathParts.push({
      name: table.display_name,
      url: table.db.is_audit
        ? undefined
        : Urls.dataModelTable(table.db_id, table.schema, table.id),
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
    <Box fw={700}>
      {parts.map((part, index) => (
        <Fragment key={index}>
          {index > 0 && " / "}
          {part.url ? (
            <Anchor component={Link} to={part.url} c="text-primary">
              {part.name}
            </Anchor>
          ) : (
            <Box component="span">{part.name}</Box>
          )}
        </Fragment>
      ))}
    </Box>
  );
}
