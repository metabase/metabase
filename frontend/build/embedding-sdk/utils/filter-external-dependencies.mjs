import { BUNDLED_PACKAGES } from "../constants/bundled-packages.mjs";

export function filterExternalDependencies(
  dependencies,
  additionalIgnoredPackages = [],
) {
  const result = {};

  Object.entries(dependencies).forEach(([packageName, version]) => {
    if (
      ![...BUNDLED_PACKAGES, ...additionalIgnoredPackages].includes(packageName)
    ) {
      result[packageName] = version;
    }
  });

  return result;
}
