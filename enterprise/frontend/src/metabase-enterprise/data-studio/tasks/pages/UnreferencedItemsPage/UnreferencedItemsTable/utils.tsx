import { t } from "ttag";

import * as Urls from "metabase/lib/urls";
import { getUserName } from "metabase/lib/user";
import type { IconName } from "metabase/ui";
import visualizations from "metabase/visualizations";
import { TextCell } from "metabase-enterprise/data-studio/tasks/components/TasksTable/TextCell";
import type { LastEditInfo, UnreferencedItem } from "metabase-types/api";

import { DateTimeCell } from "../../../components/TasksTable/DateTimeCell";
import { EntityCell } from "../../../components/TasksTable/EntityCell";
import type { TableColumnOptions } from "../../../components/TasksTable/types";

type UnreferencedItemColumnId = "name" | "last-edit-at" | "last-edit-by";

type UnreferencedItemColumnOptions = TableColumnOptions<
  UnreferencedItem,
  UnreferencedItemColumnId
>;

function getItemName(item: UnreferencedItem): string {
  switch (item.type) {
    case "table":
      return item.data.display_name ?? item.data.name;
    case "card":
    case "snippet":
      return item.data.name;
  }
}

function getItemIcon(item: UnreferencedItem): IconName {
  switch (item.type) {
    case "table":
      return "table";
    case "card":
      switch (item.data.type) {
        case "question":
          return visualizations.get(item.data.display)?.iconName ?? "table2";
        case "model":
          return "model";
        case "metric":
          return "metric";
      }
      break;
    case "snippet":
      return "sql";
  }
}

function getItemUrl(item: UnreferencedItem): string | undefined {
  switch (item.type) {
    case "table":
      return Urls.tableRowsQuery(item.id, item.data.db_id);
    case "card":
      return Urls.question({
        id: item.id,
        name: item.data.name,
        type: item.data.type,
      });
    case "snippet":
      return undefined;
  }
}

function getItemLastEditInfo(item: UnreferencedItem): LastEditInfo | undefined {
  switch (item.type) {
    case "card":
      return item.data["last-edit-info"];
    case "snippet":
      return undefined;
  }
}

function getItemNameColumn(): UnreferencedItemColumnOptions {
  return {
    id: "name",
    get name() {
      return t`Name`;
    },
    accessorFn: (item) => getItemName(item),
    cell: ({ row }) => {
      const item = row.original;
      return (
        <EntityCell
          name={getItemName(item)}
          icon={getItemIcon(item)}
          url={getItemUrl(item)}
        />
      );
    },
  };
}

function getItemLastEditAtColumn(): UnreferencedItemColumnOptions {
  return {
    id: "last-edit-at",
    get name() {
      return t`Last modified at`;
    },
    accessorFn: (item) => getItemLastEditInfo(item)?.timestamp,
    cell: ({ row }) => {
      const item = row.original;
      const value = getItemLastEditInfo(item)?.timestamp;
      return <DateTimeCell value={value} unit="day" />;
    },
  };
}

function getItemLastEditByColumn(): UnreferencedItemColumnOptions {
  return {
    id: "last-edit-by",
    get name() {
      return t`Last modified by`;
    },
    accessorFn: (item) => getItemLastEditInfo(item),
    cell: ({ row }) => {
      const item = row.original;
      const value = getItemLastEditInfo(item);
      return <TextCell value={getUserName(value)} />;
    },
  };
}

export function getColumns(): UnreferencedItemColumnOptions[] {
  return [
    getItemNameColumn(),
    getItemLastEditAtColumn(),
    getItemLastEditByColumn(),
  ];
}
