import type { PythonLibraryEditorPageParams } from "./types";

export function getPythonLibraryUrl({ path }: PythonLibraryEditorPageParams) {
  return `/bench/library/${path}`;
}
