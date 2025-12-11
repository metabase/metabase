import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockTokenFeatures } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { MetabotProvider } from "../context";
import { getMetabotInitialState } from "../state";

import { MetabotAppBarButton } from "./MetabotAppBarButton";

function setup(enabledUseCases: string[] = []) {
  const settings = mockSettings({
    "token-features": createMockTokenFeatures({ metabot_v3: true }),
    "metabot-enabled-use-cases": enabledUseCases,
  });

  setupEnterprisePlugins();

  return renderWithProviders(
    <MetabotProvider>
      <MetabotAppBarButton />
    </MetabotProvider>,
    {
      storeInitialState: createMockState({
        settings,
        plugins: { metabotPlugin: getMetabotInitialState() },
      } as any),
    },
  );
}

describe("MetabotAppBarButton", () => {
  it("should render when default use cases are enabled", () => {
    setup(["nlq", "sql", "omnibot"]);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("should not render when only non-default use cases are enabled", () => {
    setup(["transforms"]);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("should not render when use cases list is empty", () => {
    setup([]);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
