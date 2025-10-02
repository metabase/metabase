import { PLUGIN_TRANSFORMS } from "metabase/plugins";
import type { Transform } from "metabase-types/api";

export function transforms() {
  return PLUGIN_TRANSFORMS.ROOT_URL;
}

export function newNativeTransform() {
  return `${PLUGIN_TRANSFORMS.ROOT_URL}/new/native`;
}

export function newPythonTransform() {
  return `${PLUGIN_TRANSFORMS.ROOT_URL}/new/python`;
}

export function transform(id: Transform["id"]) {
  return `${PLUGIN_TRANSFORMS.ROOT_URL}/${id}`;
}

export function transformEdit(id: Transform["id"]) {
  return `${PLUGIN_TRANSFORMS.ROOT_URL}/${id}/query`;
}
