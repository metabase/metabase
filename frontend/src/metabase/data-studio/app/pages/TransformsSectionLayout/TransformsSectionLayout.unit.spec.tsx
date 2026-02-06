import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import { createMockTokenFeatures } from "metabase-types/api/mocks";
import { TransformsSectionLayout } from "./TransformsSectionLayout";
import { createMockState } from "metabase-types/store/mocks";

const setup = ({
  isHosted,
  hasTransformFeature,
  transformsEnabled,
}: {
  isHosted: boolean;
  hasTransformFeature: boolean;
  transformsEnabled: boolean;
}) => {
  const settings = mockSettings({
    "token-features": createMockTokenFeatures({
      transforms: hasTransformFeature,
      hosting: isHosted,
    }),
    "transforms-enabled": transformsEnabled,
  });

  if (isHosted || hasTransformFeature) {
    setupEnterpriseOnlyPlugin("transforms");
  }

  renderWithProviders(
    <TransformsSectionLayout>List of transforms</TransformsSectionLayout>,
    {
      storeInitialState: createMockState({
        settings,
      }),
    },
  );
};

describe("TransformSectionLayout", () => {
  it("should show you an enable button in OSS", () => {});
});
