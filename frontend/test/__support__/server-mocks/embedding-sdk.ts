import fetchMock from "fetch-mock";

import type { SdkReact18Host } from "metabase-types/api";

export function setupSdkReact18HostsEndpoint(hosts: SdkReact18Host[]) {
  fetchMock.get("path:/api/embedding-sdk/react-18-hosts", hosts);
}
