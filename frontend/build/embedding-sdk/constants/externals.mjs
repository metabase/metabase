import { filterExternalDependencies } from "../utils/filter-external-dependencies.mjs";
import { getPackageJsonContent } from "../utils/get-package-json-content.mjs";

import { BUNDLED_PACKAGES } from "./bundled-packages.mjs";
import { IGNORED_NOT_USED_BY_SDK_PACKAGES } from "./ignored-by-sdk-packages.mjs";

export const EXTERNALS = Object.keys(
  filterExternalDependencies(getPackageJsonContent().dependencies, [
    ...BUNDLED_PACKAGES,
    ...IGNORED_NOT_USED_BY_SDK_PACKAGES,
  ]),
);
