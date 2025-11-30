import { getFormattedTime } from "metabase/common/components/DateTime/DateTime";
import * as Urls from "metabase/lib/urls";
import type { IconName } from "metabase/ui";
import { getIconForVisualizationType } from "metabase/visualizations";
import type { UnreferencedItem, UserInfo } from "metabase-types/api";

import { EMPTY_VALUE } from "../constants";

export function getItemName(item: UnreferencedItem): string {
  switch (item.type) {
    case "sandbox":
      return item.data.table?.display_name ?? "";
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
    case "card": {
      const { type: cardType, name } = item.data;
      if (cardType === "model") {
        return Urls.dataStudioModel(item.id);
      }
      if (cardType === "metric") {
        return Urls.dataStudioMetric(item.id);
      }
      return Urls.question({ id: item.id, name });
    }
    case "dashboard":
      return Urls.dashboard({ id: item.id, name: item.data.name });
    case "table":
      return Urls.dataStudioDataTable(
        item.data.db_id,
        item.data.schema ?? null,
        item.id,
      );
    case "transform":
      return Urls.transform(item.id);
    case "document":
      return Urls.document({ id: item.id });
    case "snippet":
      return Urls.dataStudioSnippet(item.id);
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

type UserNameInfo = Partial<
  Pick<UserInfo, "common_name" | "first_name" | "last_name">
>;

function formatUserName(user?: UserNameInfo | null): string | null {
  if (!user) {
    return null;
  }
  const fullName = `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim();
  return user.common_name ?? fullName ?? null;
}

export function getCreatorName(item: UnreferencedItem): string | null {
  switch (item.type) {
    case "card":
    case "dashboard":
    case "document":
    case "transform":
      return formatUserName(item.data.creator);
    case "table":
    case "snippet":
    case "sandbox":
      return null;
  }
}

export function getOwnerName(item: UnreferencedItem): string | null {
  switch (item.type) {
    case "table":
      return formatUserName(item.data.owner);
    case "card":
    case "dashboard":
    case "document":
    case "transform":
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
    case "dashboard":
      return item.data["last-edit-info"]?.timestamp ?? null;
    case "document":
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
    case "dashboard":
      return formatUserName(item.data["last-edit-info"]);
    case "table":
    case "document":
    case "transform":
    case "snippet":
    case "sandbox":
      return null;
  }
}

export function getViewCount(item: UnreferencedItem): number | null {
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

export type LinkInfo = {
  name: string;
  url: string;
};

export function getCollectionInfo(item: UnreferencedItem): LinkInfo | null {
  switch (item.type) {
    case "card":
    case "dashboard":
    case "document": {
      const { collection } = item.data;
      if (!collection) {
        return null;
      }
      return {
        name: collection.name,
        url: Urls.collection(collection),
      };
    }
    case "table":
    case "transform":
    case "snippet":
    case "sandbox":
      return null;
  }
}

export function getDatabaseInfo(item: UnreferencedItem): LinkInfo | null {
  if (item.type !== "table") {
    return null;
  }
  const { db } = item.data;
  if (!db) {
    return null;
  }
  return {
    name: db.name,
    url: Urls.dataStudioDataDatabase(db.id),
  };
}

export function getSchemaInfo(item: UnreferencedItem): LinkInfo | null {
  if (item.type !== "table") {
    return null;
  }
  const { db_id, schema } = item.data;
  if (schema == null) {
    return null;
  }
  return {
    name: schema,
    url: Urls.dataStudioDataSchema(db_id, schema),
  };
}

export type TargetTableInfo = {
  name: string;
  url: string | null;
};

export function getTargetTableInfo(
  item: UnreferencedItem,
): TargetTableInfo | null {
  if (item.type !== "transform") {
    return null;
  }

  const { table, target } = item.data;

  if (table) {
    return {
      name: table.display_name ?? table.name,
      url: Urls.dataStudioDataTable(
        table.db_id,
        table.schema ?? null,
        table.id,
      ),
    };
  }

  if (target) {
    return {
      name: target.name,
      url: null,
    };
  }

  return null;
}

export function getCreatedDate(item: UnreferencedItem): string | null {
  switch (item.type) {
    case "card":
    case "dashboard":
    case "document":
      return item.data.created_at ?? null;
    case "table":
    case "transform":
    case "snippet":
    case "sandbox":
      return null;
  }
}

export function formatDate(dateString: string | null): string {
  if (!dateString) {
    return EMPTY_VALUE;
  }
  return String(getFormattedTime(dateString, "minute"));
}
