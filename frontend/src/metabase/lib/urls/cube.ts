import slugg from "slugg";

import type DatabaseV1 from "metabase-lib/v1/metadata/Database";
import type Table from "metabase-lib/v1/metadata/Table";
import { SAVED_QUESTIONS_VIRTUAL_DB_ID } from "metabase-lib/v1/metadata/utils/saved-questions";
import type { CubeDataItem, Database } from "metabase-types/api";

import { appendSlug } from "./utils";

const removeJsExtension = (filename: string) => {
  if (filename.endsWith(".js")) {
    return filename.slice(0, -3);
  }
  return filename;
};

export function browseCube(cube: CubeDataItem) {
  const name = removeJsExtension(cube.fileName);
  const currentUrl = window.location.pathname;
  const slugMatch = currentUrl.match(/\/browse\/semantic-layer\/([^/]+)/);
  const slug = slugMatch ? slugMatch[1] : "";

  return appendSlug(`/browse/semantic-layer/${slug}/cubes/${name}`);
}

export function browseCubeFlow() {
  const currentUrl = window.location.pathname;
  const slugMatch = currentUrl.match(/\/browse\/semantic-layer\/([^/]+)/);
  const slug = slugMatch ? slugMatch[1] : "";
  return appendSlug(`/browse/semantic-layer/${slug}/data-map`);
}

export function browseValidations() {
  return appendSlug(`/browse/validation`);
}
