import { filterExternalDependencies } from "../utils/filter-external-dependencies.mjs";
import { getPackageJsonContent } from "../utils/get-package-json-content.mjs";

export const EXTERNALS = Object.keys(
  filterExternalDependencies(getPackageJsonContent().dependencies),
);
