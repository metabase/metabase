// They are mostly used for local development
export const isInvalidMetabaseVersion = (mbVersion: string) => {
  return (
    mbVersion === "vLOCAL_DEV" ||
    mbVersion === "vUNKNOWN" ||
    mbVersion.endsWith("-SNAPSHOT")
  );
};
