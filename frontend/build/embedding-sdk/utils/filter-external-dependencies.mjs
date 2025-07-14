export function filterExternalDependencies(
  dependencies,
  additionalIgnoredPackages = [],
) {
  const result = {};

  Object.entries(dependencies).forEach(([packageName, version]) => {
    if (!additionalIgnoredPackages.includes(packageName)) {
      result[packageName] = version;
    }
  });

  return result;
}
