import * as Urls from "metabase/lib/urls";
import type { DependencyInfo } from "metabase-types/api";

export function getNodeUrl(node: DependencyInfo) {
  switch (node.type) {
    case "card":
      return Urls.question({
        id: node.id,
        name: node.data.name,
        type: node.data.type,
      });
    case "transform":
      return `/admin/transforms/${node.id}`;
    case "table":
      return `/admin/datamodel/database/${node.data.db_id}/schema/${node.data.db_id}:${encodeURIComponent(node.data.schema ?? "")}/table/${node.id}`;
    default:
      return null;
  }
}
