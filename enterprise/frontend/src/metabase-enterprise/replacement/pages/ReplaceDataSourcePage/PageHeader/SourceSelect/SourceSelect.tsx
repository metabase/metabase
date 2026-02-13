import { skipToken, useGetCardQuery, useGetTableQuery } from "metabase/api";
import { Button, Icon, type IconName, Input, Loader } from "metabase/ui";
import type { Card, ReplaceSourceEntry, Table } from "metabase-types/api";

type SourceSelectProps = {
  entry: ReplaceSourceEntry | undefined;
  label: string;
  placeholder: string;
};

export function SourceSelect({ entry, label, placeholder }: SourceSelectProps) {
  return (
    <Input.Wrapper label={label}>
      <SourceSelectButton entry={entry} placeholder={placeholder} />
    </Input.Wrapper>
  );
}

type SourceSelectButtonProps = {
  entry: ReplaceSourceEntry | undefined;
  placeholder: string;
};

function SourceSelectButton({ entry, placeholder }: SourceSelectButtonProps) {
  const { data: table, isFetching: isTableFetching } = useGetTableQuery(
    entry?.type === "table" ? { id: entry.id } : skipToken,
  );
  const { data: card, isFetching: isCardFetching } = useGetCardQuery(
    entry?.type === "card" ? { id: entry.id } : skipToken,
  );
  const sourceInfo = getSourceInfo(table, card);
  const isFetching = isTableFetching || isCardFetching;
  return (
    <Button
      leftSection={sourceInfo != null && <Icon name={sourceInfo.icon} />}
      rightSection={
        isFetching ? <Loader size="xs" /> : <Icon name="chevrondown" />
      }
    >
      {sourceInfo != null ? sourceInfo.breadcrumbs.join(" / ") : placeholder}
    </Button>
  );
}

type SourceInfo = {
  icon: IconName;
  breadcrumbs: string[];
};

function getSourceInfo(
  table: Table | undefined,
  card: Card | undefined,
): SourceInfo | undefined {
  if (table != null) {
    return getTableSourceInfo(table);
  }
  if (card != null) {
    return getCardSourceInfo(card);
  }
  return undefined;
}

function getTableSourceInfo(table: Table): SourceInfo {
  const breadcrumbs: string[] = [];
  if (table.db != null) {
    breadcrumbs.push(table.db.name);
  }
  if (table.schema != null) {
    breadcrumbs.push(table.schema);
  }
  breadcrumbs.push(table.display_name);

  return {
    icon: "database",
    breadcrumbs,
  };
}

function getCardSourceInfo(card: Card): SourceInfo {
  if (card.document != null) {
    return {
      icon: "document",
      breadcrumbs: [card.document.name, card.name],
    };
  }
  if (card.dashboard != null) {
    return {
      icon: "dashboard",
      breadcrumbs: [card.dashboard.name, card.name],
    };
  }
  if (card.collection != null) {
    return {
      icon: "collection",
      breadcrumbs: [card.collection.name, card.name],
    };
  }
  return {
    icon: "table2",
    breadcrumbs: [card.name],
  };
}
