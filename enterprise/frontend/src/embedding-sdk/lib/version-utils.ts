import { versionToNumericComponents } from "metabase/lib/utils";

// They are mostly used for local development
export const isInvalidMetabaseVersion = (mbVersion: string) => {
  return (
    mbVersion === "vLOCAL_DEV" ||
    mbVersion === "vUNKNOWN" ||
    mbVersion.endsWith("-SNAPSHOT")
  );
};

export const isSdkVersionCompatibleWithMetabaseVersion = ({
  mbVersion,
  sdkVersion,
}: {
  mbVersion: string;
  sdkVersion: string;
}) => {
  const mbVersionComponents = versionToNumericComponents(mbVersion);
  const sdkVersionComponents = versionToNumericComponents(sdkVersion);
  return mbVersionComponents?.[1] === sdkVersionComponents?.[1];
};
