export const isReactVersionLessThanOrEqualTo17 = (version: string) => {
  const versionParts = version.split(".").map(Number);
  return versionParts[0] < 17 || versionParts[0] === 17;
};
