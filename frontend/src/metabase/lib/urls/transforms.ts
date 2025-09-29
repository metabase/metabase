import type { Transform } from "metabase-types/api";

export function transform(transform: Pick<Transform, "id">) {
  return `/admin/transforms/${transform.id}/query`;
}
