import fetchMock from "fetch-mock";

import type { CustomVizPluginRuntime } from "metabase-types/api";

export const setupCustomVizPluginListEndpoint = (
  plugins: CustomVizPluginRuntime[] = [],
) => {
  fetchMock.get("path:/api/ee/custom-viz-plugin/list", plugins);
};
