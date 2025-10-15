import type { PythonLibraryEditorPageParams } from "./types";

export function getPythonLibraryUrl({ path }: PythonLibraryEditorPageParams) {
  return `/admin/transforms/library/${path}`;
}
