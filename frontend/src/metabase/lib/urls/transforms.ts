import type { Transform } from "metabase-types/api";

export function transforms() {
  return `/admin/transforms`;
}

export function newNativeTransform() {
  return `/admin/transforms/new/native`;
}

export function newPythonTransform() {
  return `/admin/transforms/new/python`;
}

export function transform(id: Transform["id"]) {
  return `/admin/transforms/${id}`;
}

export function transformEdit(id: Transform["id"]) {
  return `/admin/transforms/${id}/query`;
}
