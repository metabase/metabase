import { getPermissionsBasePath } from "metabase/admin/permissions/utils/base-path";
import * as Urls from "metabase/urls";

/** Used to pick admin's vs. the hub's color scheme, based on where the permissions editor is mounted. */
export function isEmbeddingHubPermissions() {
  return getPermissionsBasePath() === Urls.embeddingHubPermissions();
}
