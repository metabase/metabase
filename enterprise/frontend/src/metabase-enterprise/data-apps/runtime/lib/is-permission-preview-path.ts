import { getMetabaseRootPath } from "embedding-sdk-shared/lib/get-current-metabase-instance-url";

/** Matches `metabase.request.util/permission-preview?`: the document an admin previews the app in as another user. */
export function isPermissionPreviewPath(pathname: string): boolean {
  return pathname.startsWith(
    `${getMetabaseRootPath()}/embed/permission-preview/`,
  );
}
