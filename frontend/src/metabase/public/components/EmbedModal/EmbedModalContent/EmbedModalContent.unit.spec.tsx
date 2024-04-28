import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "__support__/ui";
import type { EmbedResource } from "metabase/public/lib/types";
import { createMockUser } from "metabase-types/api/mocks";
import { createMockSettingsState } from "metabase-types/store/mocks";

import type { EmbedModalContentProps } from "./EmbedModalContent";
import { EmbedModalContent } from "./EmbedModalContent";

describe("EmbedModalContent", () => {
  describe("Select Embed Type phase", () => {
    it("should render", () => {
      setup();

      expect(screen.getByText("Static embed")).toBeInTheDocument();
      expect(screen.getByText("Public embed")).toBeInTheDocument();
    });

    it("should switch to StaticEmbedSetupPane", async () => {
      const { goToNextStep } = setup();

      expect(goToNextStep).toHaveBeenCalledTimes(0);

      await userEvent.click(screen.getByText("Set this up"));

      expect(goToNextStep).toHaveBeenCalledTimes(1);
    });

    it("should render StaticEmbedSetupPane when embedType=application", () => {
      setup({
        props: {
          embedType: "application",
        },
      });

      expect(screen.getByText("Setting up a static embed")).toBeInTheDocument();
    });
  });
});

function setup(
  {
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
    },
  }: {
    props: Partial<EmbedModalContentProps>;
  } = {
    props: {},
  },
) {
  const view = renderWithProviders(
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
    />,
    {
      storeInitialState: {
        currentUser: createMockUser({ is_superuser: true }),
        settings: createMockSettingsState({
          "enable-embedding": true,
          "embedding-secret-key": "my_super_secret_key",
        }),
      },
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
