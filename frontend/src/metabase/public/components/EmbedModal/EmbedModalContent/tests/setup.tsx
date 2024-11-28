import { Route } from "react-router";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import type { EmbedResource } from "metabase/public/lib/types";
import type { TokenFeatures } from "metabase-types/api";
import { createMockUser } from "metabase-types/api/mocks";

import type { EmbedModalContentProps } from "../EmbedModalContent";
import { EmbedModalContent } from "../EmbedModalContent";

type EnableEmbedding = {
  static?: boolean;
  interactive?: boolean;
  sdk?: boolean;
};

export interface SetupOpts {
  enableEmbedding?: EnableEmbedding;
  props?: Partial<EmbedModalContentProps>;
  hasEnterprisePlugins?: boolean;
  tokenFeatures?: TokenFeatures;
}

export function setup(
  {
    enableEmbedding: {
      static: enableEmbeddingStatic = false,
      interactive: enableEmbeddingInteractive = false,
      sdk: enableEmbeddingSdk = false,
    } = {
      static: false,
      interactive: false,
      sdk: false,
    },
    props: {
      embedType = null,
      resource = {} as EmbedResource,
      resourceType = "dashboard",
      resourceParameters = [],
      goToNextStep = jest.fn(),
      getPublicUrl = jest.fn(_resource => "some URL"),
      onUpdateEmbeddingParams = jest.fn(),
      onUpdateEnableEmbedding = jest.fn(),
      onCreatePublicLink = jest.fn(),
      onDeletePublicLink = jest.fn(),
    } = {},
    hasEnterprisePlugins,
    tokenFeatures,
  }: SetupOpts = {
    props: {},
  },
) {
  const settings = mockSettings({
    "token-features": tokenFeatures,
    "enable-embedding-static": enableEmbeddingStatic,
    "enable-embedding-interactive": enableEmbeddingInteractive,
    "enable-embedding-sdk": enableEmbeddingSdk,
    "embedding-secret-key": "my_super_secret_key",
  });

  if (hasEnterprisePlugins) {
    setupEnterprisePlugins();
  }

  const view = renderWithProviders(
    <Route
      path="*"
      component={() => {
        return (
          <EmbedModalContent
            embedType={embedType}
            goToNextStep={goToNextStep}
            resource={resource}
            resourceType={resourceType}
            resourceParameters={resourceParameters}
            getPublicUrl={getPublicUrl}
            onUpdateEmbeddingParams={onUpdateEmbeddingParams}
            onUpdateEnableEmbedding={onUpdateEnableEmbedding}
            onCreatePublicLink={onCreatePublicLink}
            onDeletePublicLink={onDeletePublicLink}
          />
        );
      }}
    />,
    {
      storeInitialState: {
        currentUser: createMockUser({ is_superuser: true }),
        settings,
      },
      withRouter: true,
    },
  );

  return {
    ...view,
    goToNextStep,
    getPublicUrl,
    onUpdateEmbeddingParams,
    onUpdateEnableEmbedding,
    onCreatePublicLink,
    onDeletePublicLink,
  };
}
