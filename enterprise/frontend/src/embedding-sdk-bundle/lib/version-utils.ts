import { versionToNumericComponents } from "metabase/lib/utils";

// They are mostly used for local development
export const isInvalidMetabaseVersion = (mbVersion: string) => {
  return (
    mbVersion === "vLOCAL_DEV" ||
    mbVersion === "vUNKNOWN" ||
    mbVersion.endsWith("-SNAPSHOT")
  );
};

export const isSdkPackageCompatibleWithSdkBundle = ({
  sdkPackageVersion,
  sdkBundleVersion,
}: {
  sdkPackageVersion: string;
  sdkBundleVersion: string;
}) => {
  const sdkPackageVersionComponents =
    versionToNumericComponents(sdkPackageVersion);
  const sdkBundleVersionComponents =
    versionToNumericComponents(sdkBundleVersion);

  return sdkBundleVersionComponents?.[1] === sdkPackageVersionComponents?.[1];
};
