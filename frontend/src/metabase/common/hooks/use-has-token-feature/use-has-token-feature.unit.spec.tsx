import { renderWithProviders, screen } from "__support__/ui";
import type { TokenFeature } from "metabase-types/api";
import { createMockTokenFeatures } from "metabase-types/api/mocks";
import { createMockSettingsState } from "metabase-types/store/mocks";

import { useHasTokenFeature } from "./use-has-token-feature";

const TestComponent = ({ feature }: { feature: TokenFeature }) => {
  const hasFeature = useHasTokenFeature(feature);

  return (
    <div>
      feature {feature} is {hasFeature ? "on" : "off"}
    </div>
  );
};

const setup = ({ feature }: { feature: TokenFeature }) => {
  const mockSettings = createMockSettingsState({
    "token-features": createMockTokenFeatures({
      audit_app: true,
      embedding: false,
    }),
  });

  renderWithProviders(<TestComponent feature={feature} />, {
    storeInitialState: { settings: mockSettings },
  });
};

describe("useHasTokenFeature", () => {
  it("should get a present feature", async () => {
    setup({ feature: "audit_app" });
    expect(screen.getByText("feature audit_app is on")).toBeInTheDocument();
  });

  it("should get an absent feature", async () => {
    setup({ feature: "embedding" });
    expect(screen.getByText("feature embedding is off")).toBeInTheDocument();
  });

  it("should get an invalid feature", async () => {
    // @ts-expect-error testing invalid feature
    setup({ feature: "surfing" });
    expect(screen.getByText("feature surfing is off")).toBeInTheDocument();
  });
});
