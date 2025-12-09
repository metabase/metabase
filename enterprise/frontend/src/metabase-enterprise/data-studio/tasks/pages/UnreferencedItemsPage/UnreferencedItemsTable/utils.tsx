import { t } from "ttag";

import * as Urls from "metabase/lib/urls";
import type { IconName } from "metabase/ui";
import visualizations from "metabase/visualizations";
import type { UnreferencedItem } from "metabase-types/api";

import { EntityCell } from "../../../components/TasksTable/EntityCell";
import type { TableColumnOptions } from "../../../components/TasksTable/types";

type UnreferencedItemColumnId = "name";

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

function getItemUrl(item: UnreferencedItem): string | null {
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
      return null;
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

export function getColumns(): UnreferencedItemColumnOptions[] {
  return [getItemNameColumn()];
}
