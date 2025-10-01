import { PLUGIN_TRANSFORMS } from "metabase/plugins";
import type { Transform } from "metabase-types/api";

export function transforms() {
  return `/admin/transforms`;
}

export function newNativeTransform() {
  return `${ROOT_URL}/new/native`;
}

export function newPythonTransform() {
  return `${ROOT_URL}/new/python`;
}

export function transform(id: Transform["id"]) {
  return `${ROOT_URL}/${id}`;
}

export function transformEdit(id: Transform["id"]) {
  return `${ROOT_URL}/${id}/query`;
}
