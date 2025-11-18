import { EMBEDDING_SDK_PACKAGE_UNKNOWN_VERSION } from "build-configs/embedding-sdk/constants/versions";
import { getBuildInfo } from "embedding-sdk-shared/lib/get-build-info";

export function getSdkRequestHeaders({
  hash,
  clientName = "embedding-sdk-react",
}: { hash?: string; clientName?: string } = {}) {
  return {
    // eslint-disable-next-line no-literal-metabase-strings -- header name
    "X-Metabase-Client": clientName,
    // eslint-disable-next-line no-literal-metabase-strings -- header name
    "X-Metabase-Client-Version":
      getBuildInfo("METABASE_EMBEDDING_SDK_PACKAGE_BUILD_INFO").version ??
      EMBEDDING_SDK_PACKAGE_UNKNOWN_VERSION,
    // eslint-disable-next-line no-literal-metabase-strings -- header name
    ...(hash && { "X-Metabase-SDK-JWT-Hash": hash }),
  };
}


