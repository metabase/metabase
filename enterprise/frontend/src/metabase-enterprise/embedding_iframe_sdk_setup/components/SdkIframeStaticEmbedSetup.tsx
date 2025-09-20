import { useState } from "react";

import { useSetting } from "metabase/common/hooks";
import { EmbedModalContentStatusBar } from "metabase/public/components/EmbedModal/StaticEmbedSetupPane/EmbedModalContentStatusBar";
import type { StaticEmbedSetupPaneProps } from "metabase/public/components/EmbedModal/StaticEmbedSetupPane/StaticEmbedSetupPane";
import { getDefaultEmbeddingParams } from "metabase/public/components/EmbedModal/StaticEmbedSetupPane/lib/get-default-embedding-params";
import { getHasSettingsChanges } from "metabase/public/components/EmbedModal/StaticEmbedSetupPane/lib/get-has-settings-changes";
import { getStaticEmbedSetupPublishHandlers } from "metabase/public/components/EmbedModal/StaticEmbedSetupPane/lib/get-static-embed-setup-publish-handlers";
import type { EmbeddingParameters } from "metabase/public/lib/types";
import { Stack } from "metabase/ui";

import { SdkIframeEmbedSetupContent } from "./SdkIframeEmbedSetup";
import { SdkIframeEmbedSetupProvider } from "./SdkIframeEmbedSetupProvider";

export const SdkIframeStaticEmbedSetupInner = ({
  resource,
  resourceType,
  resourceParameters,
  onUpdateEnableEmbedding,
  onUpdateEmbeddingParams,
}: StaticEmbedSetupPaneProps) => {
  const exampleDashboardId = useSetting("example-dashboard-id");

  const initialEmbeddingParams = getDefaultEmbeddingParams(
    resource,
    resourceParameters,
  );
  const [embeddingParams, setEmbeddingParams] = useState<EmbeddingParameters>(
    initialEmbeddingParams,
  );

  const hasSettingsChanges = getHasSettingsChanges({
    initialEmbeddingParams,
    embeddingParams,
  });

  const { handleSave, handleUnpublish, handleDiscard } =
    getStaticEmbedSetupPublishHandlers({
      resource,
      resourceType,
      resourceParameters,
      onUpdateEnableEmbedding,
      onUpdateEmbeddingParams,
      embeddingParams,
      setEmbeddingParams,
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
