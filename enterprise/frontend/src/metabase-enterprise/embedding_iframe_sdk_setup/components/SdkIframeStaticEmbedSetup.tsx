import { useMemo } from "react";
import { useMount } from "react-use";

import { useSetting } from "metabase/common/hooks";
import { EmbedModalContentStatusBar } from "metabase/public/components/EmbedModal/StaticEmbedSetupPane/EmbedModalContentStatusBar";
import type { StaticEmbedSetupPaneProps } from "metabase/public/components/EmbedModal/StaticEmbedSetupPane/StaticEmbedSetupPane";
import { getDefaultEmbeddingParams } from "metabase/public/components/EmbedModal/StaticEmbedSetupPane/lib/get-default-embedding-params";
import { getHasSettingsChanges } from "metabase/public/components/EmbedModal/StaticEmbedSetupPane/lib/get-has-settings-changes";
import { getStaticEmbedSetupPublishHandlers } from "metabase/public/components/EmbedModal/StaticEmbedSetupPane/lib/get-static-embed-setup-publish-handlers";
import { Stack } from "metabase/ui";
import { useStaticEmbeddingParameters } from "metabase-enterprise/embedding_iframe_sdk_setup/components/ParameterSettings/hooks/use-static-embedding-paramers";
import { useSdkIframeEmbedSetupContext } from "metabase-enterprise/embedding_iframe_sdk_setup/context";

import { SdkIframeEmbedSetupContent } from "./SdkIframeEmbedSetup";
import { SdkIframeEmbedSetupProvider } from "./SdkIframeEmbedSetupProvider";

export const SdkIframeStaticEmbedSetupInner = ({
  resource,
  resourceType,
  resourceParameters: initialResourceParameters,
  onUpdateEnableEmbedding,
  onUpdateEmbeddingParams,
}: StaticEmbedSetupPaneProps) => {
  const exampleDashboardId = useSetting("example-dashboard-id");
  const { availableParameters: resourceParameters, isLoadingParameters } =
    useSdkIframeEmbedSetupContext();
  const { buildEmbeddedParameters, setEmbeddingParameters } =
    useStaticEmbeddingParameters();

  const initialEmbeddingParameters = getDefaultEmbeddingParams(
    resource,
    initialResourceParameters,
  );
  const embeddingParameters = useMemo(
    () => buildEmbeddedParameters(resourceParameters),
    [buildEmbeddedParameters, resourceParameters],
  );

  useMount(() => {
    setEmbeddingParameters(initialEmbeddingParameters);
  });

  const hasSettingsChanges =
    !isLoadingParameters &&
    getHasSettingsChanges({
      initialEmbeddingParams: initialEmbeddingParameters,
      embeddingParams: embeddingParameters,
    });

  const { handleSave, handleUnpublish, handleDiscard } =
    getStaticEmbedSetupPublishHandlers({
      resource,
      resourceType,
      resourceParameters,
      onUpdateEnableEmbedding,
      onUpdateEmbeddingParams,
      embeddingParams: embeddingParameters,
      setEmbeddingParams: setEmbeddingParameters,
      exampleDashboardId,
    });

  return (
    <>
      <EmbedModalContentStatusBar
        resourceType={resourceType}
        isPublished={resource.enable_embedding}
        hasSettingsChanges={hasSettingsChanges}
        onSave={handleSave}
        onUnpublish={handleUnpublish}
        onDiscard={handleDiscard}
      />

      <SdkIframeEmbedSetupContent />
    </>
  );
};

export const SdkIframeStaticEmbedSetup = (props: StaticEmbedSetupPaneProps) => {
  const { resource, resourceType } = props;

  return (
    <Stack w="80rem">
      <SdkIframeEmbedSetupProvider
        startWith={{
          embeddingType: "static",
          step: "select-embed-options",
          resourceType: resourceType === "question" ? "chart" : resourceType,
          resourceId: resource.id,
        }}
      >
        <SdkIframeStaticEmbedSetupInner {...props} />
      </SdkIframeEmbedSetupProvider>
    </Stack>
  );
};
