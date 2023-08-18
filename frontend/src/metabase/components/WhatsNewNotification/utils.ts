const getMajor = (version: string) => version.split(".")[1];

/** this considers X a major in v0.X.Y*/
export const isMajorUpdate = (version: string, comparedTo: string): boolean => {
  return getMajor(version) > getMajor(comparedTo);
};
