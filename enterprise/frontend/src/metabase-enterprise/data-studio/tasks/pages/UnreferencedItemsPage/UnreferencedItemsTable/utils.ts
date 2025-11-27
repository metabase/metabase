import { getFormattedTime } from "metabase/common/components/DateTime/DateTime";
import * as Urls from "metabase/lib/urls";
import type { IconName } from "metabase/ui";
import { getIconForVisualizationType } from "metabase/visualizations";
import type { UnreferencedItem } from "metabase-types/api";

export function getItemName(item: UnreferencedItem): string {
  switch (item.type) {
    case "sandbox":
      return item.data.table?.display_name ?? null;
    case "table":
      return item.data.display_name ?? item.data.name;
    case "card":
    case "dashboard":
    case "document":
    case "transform":
    case "snippet":
      return item.data.name;
  }
}

export function getItemUrl(item: UnreferencedItem): string | null {
  switch (item.type) {
    case "card":
      return Urls.question({ id: item.id, name: item.data.name });
    case "dashboard":
      return Urls.dashboard({ id: item.id, name: item.data.name });
    case "table":
      return Urls.tableRowsQuery(item.data.db_id, item.id);
    case "transform":
      return Urls.transform(item.id);
    case "document":
      return Urls.document({ id: item.id });
    case "snippet":
    case "sandbox":
      return null;
  }
}

export function getItemIcon(item: UnreferencedItem): IconName {
  switch (item.type) {
    case "card": {
      const { type: cardType, display } = item.data;
      if (cardType === "model") {
        return "model";
      }
      if (cardType === "metric") {
        return "metric";
      }
      if (display) {
        return getIconForVisualizationType(display);
      }
      return "table";
    }
    case "dashboard":
      return "dashboard";
    case "table":
    case "sandbox":
      return "table";
    case "transform":
      return "transform";
    case "snippet":
      return "snippet";
    case "document":
      return "document";
  }
}

export function getEntityOwnerName(item: UnreferencedItem): string | null {
  switch (item.type) {
    case "table": {
      const { owner } = item.data;
      return owner ? `${owner.first_name} ${owner.last_name}` : null;
    }
    case "card":
    case "dashboard":
    case "document":
    case "transform": {
      const { creator } = item.data;
      return creator
        ? (creator.common_name ?? `${creator.first_name} ${creator.last_name}`)
        : null;
    }
    case "snippet":
    case "sandbox":
      return null;
  }
}

export function getLastRunDate(item: UnreferencedItem): string | null {
  if (item.type === "transform") {
    return item.data.last_run?.start_time ?? null;
  }
  return null;
}

export function getLastModifiedDate(item: UnreferencedItem): string | null {
  switch (item.type) {
    case "card":
    case "dashboard": {
      const lastEdit = item.data["last-edit-info"];
      if (lastEdit?.timestamp) {
        return lastEdit.timestamp;
      }
      return item.data.created_at ?? null;
    }
    case "document":
      return item.data.created_at ?? null;
    case "table":
    case "transform":
    case "snippet":
    case "sandbox":
      return null;
  }
}

export function getLastModifiedByName(item: UnreferencedItem): string | null {
  switch (item.type) {
    case "card":
    case "dashboard": {
      const lastEdit = item.data["last-edit-info"];
      if (lastEdit) {
        return `${lastEdit.first_name} ${lastEdit.last_name}`;
      }
      return null;
    }
    case "table":
    case "document":
    case "transform":
    case "snippet":
    case "sandbox":
      return null;
  }
}

export function getRunCount(item: UnreferencedItem): number | null {
  switch (item.type) {
    case "card":
    case "dashboard":
    case "document":
    case "table":
      return item.data.view_count ?? null;
    case "transform":
    case "snippet":
    case "sandbox":
      return null;
  }
}

export function formatDate(dateString: string | null): string {
  if (!dateString) {
    return "-";
  }
  return String(getFormattedTime(dateString, "minute"));
}
