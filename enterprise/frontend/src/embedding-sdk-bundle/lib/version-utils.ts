import { versionToNumericComponents } from "metabase/lib/utils";

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
