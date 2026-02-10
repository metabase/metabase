// SKIPPED eslint-disable-next-line no-external-references-for-sdk-package-code
import { EMBEDDING_SDK_BUNDLE_UNKNOWN_VERSION } from "build-configs/embedding-sdk/constants/versions";
// SKIPPED eslint-disable-next-line no-external-references-for-sdk-package-code
import { versionToNumericComponents } from "metabase/lib/utils";

// They are mostly used for local development
export const isInvalidMetabaseVersion = (mbVersion: string) => {
  return (
    mbVersion === "vLOCAL_DEV" ||
    mbVersion === EMBEDDING_SDK_BUNDLE_UNKNOWN_VERSION ||
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

  if (!sdkPackageVersionComponents || !sdkBundleVersionComponents) {
    return true;
  }

  return sdkBundleVersionComponents?.[1] >= sdkPackageVersionComponents?.[1];
};

export const isSdkBundleCompatibleWithMetabaseInstance = ({
  sdkBundleVersion,
  metabaseInstanceVersion,
}: {
  sdkBundleVersion: string;
  metabaseInstanceVersion: string;
}) => {
  const sdkBundleVersionComponents =
    versionToNumericComponents(sdkBundleVersion);
  const metabaseInstanceVersionComponents = versionToNumericComponents(
    metabaseInstanceVersion,
  );

  return (
    sdkBundleVersionComponents?.[1] === metabaseInstanceVersionComponents?.[1]
  );
};
