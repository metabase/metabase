import { getMajorVersion } from "embedding-sdk/sdk-shared/lib/get-major-version";

export const isSdkPackageCompatibleWithSdkBundle = ({
  sdkPackageVersion,
  sdkBundleVersion,
}: {
  sdkPackageVersion: string;
  sdkBundleVersion: string;
}) => getMajorVersion(sdkPackageVersion) === getMajorVersion(sdkBundleVersion);
