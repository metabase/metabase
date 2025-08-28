import { useMemo } from "react";
import _ from "underscore";

import { useGetPermissionsGraphQuery } from "metabase/api";
import { useGetEmbeddingHubChecklistQuery } from "metabase/api/embedding-hub";
import { useSetting } from "metabase/common/hooks";

import type { EmbeddingHubStepId } from "../types";

/**
 * Embedding Hub completion steps should be derived by the instance state at the time, or tracked manually in instance settings for some of them.
 */
export const useCompletedEmbeddingHubSteps = (): Record<
  EmbeddingHubStepId,
  boolean
> => {
  const { data: embeddingHubChecklist } = useGetEmbeddingHubChecklistQuery();

  const isJwtEnabled = useSetting("jwt-enabled");
  const isSamlEnabled = useSetting("saml-enabled");
  const isJwtConfigured = useSetting("jwt-configured");
  const isSamlConfigured = useSetting("saml-configured");

  const isSsoReady =
    (isJwtEnabled && isJwtConfigured) || (isSamlEnabled && isSamlConfigured);

  const { data: permissionsGraph } = useGetPermissionsGraphQuery();

  const hasConfiguredSandboxes = useMemo(
    () => getValuesFlat(permissionsGraph).includes("sandboxed"),
    [permissionsGraph],
  );

  const isTestEmbedCreated = useSetting(
    "embedding-hub-test-embed-snippet-created",
  );

  const isProductionEmbedCreated = useSetting(
    "embedding-hub-production-embed-snippet-created",
  );

  return useMemo(() => {
    return {
      "create-test-embed": isTestEmbedCreated ?? false,
      "add-data": false,
      "create-dashboard": embeddingHubChecklist?.["create-dashboard"] ?? false,
      "configure-row-column-security": hasConfiguredSandboxes,
      "secure-embeds": isSsoReady,
      "embed-production": isProductionEmbedCreated ?? false,
    };
  }, [
    isTestEmbedCreated,
    embeddingHubChecklist,
    hasConfiguredSandboxes,
    isSsoReady,
    isProductionEmbedCreated,
  ]);
};

/**
 * Converts nested objects to a flat array of "leaf" values
 * eg: { k1: { k3: "1" }, k2: "2" } -> ["1", "2"]
 */
function getValuesFlat(obj: unknown): string[] {
  return _.chain(obj)
    .values()
    .map((v) => (_.isObject(v) ? getValuesFlat(v) : v))
    .flatten()
    .filter((v): v is string => typeof v === "string")
    .value();
}
