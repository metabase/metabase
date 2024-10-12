import type { CubeDataItem } from "metabase-types/api";

import { appendSlug } from "./utils";

const removeJsExtension = (filename: string) => {
  if (filename.endsWith(".js")) {
    return filename.slice(0, -3);
  }
  return filename;
};

export function browseCube(cube: { name: string }) {
  const name = removeJsExtension(cube.name);
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