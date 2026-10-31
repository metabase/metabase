import { setupEnterprisePlugins } from "__support__/enterprise";
import { setupUserMetabotPermissionsEndpoint } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import type { UserMetabotPermissions } from "metabase-types/api";
import {
  createMockTokenFeatures,
  createMockUserMetabotPermissions,
} from "metabase-types/api/mocks";

import { MetabotQueryBuilder } from "./MetabotQueryBuilder";

jest.mock("metabase/metabot/components/MetabotAsk", () => ({
  MetabotAsk: () => <div data-testid="metabot-ask" />,
}));

jest.mock("../../containers/QueryBuilder", () => ({
  QueryBuilder: () => <div data-testid="query-builder" />,
}));

interface SetupOpts {
  isMetabotEnabled?: boolean;
  nlqPermission?: UserMetabotPermissions["metabot-nlq"];
}

const setup = ({
  isMetabotEnabled = true,
  nlqPermission = "yes",
}: SetupOpts = {}) => {
  setupEnterprisePlugins();
  setupUserMetabotPermissionsEndpoint(
    createMockUserMetabotPermissions({ "metabot-nlq": nlqPermission }),
  );

  renderWithProviders(<MetabotQueryBuilder />, {
    storeInitialState: createMockState({
      settings: mockSettings({
        "metabot-enabled?": isMetabotEnabled,
        "llm-metabot-configured?": true,
        "token-features": createMockTokenFeatures({ ai_controls: true }),
      }),
    }),
  });
};

describe("MetabotQueryBuilder", () => {
  it("renders the Metabot ask page, not the query builder, with NLQ access", async () => {
    setup();

    expect(await screen.findByTestId("metabot-ask")).toBeInTheDocument();
    expect(screen.queryByTestId("query-builder")).not.toBeInTheDocument();
  });

  it("renders the query builder without NLQ access", async () => {
    setup({ nlqPermission: "no" });

    expect(await screen.findByTestId("query-builder")).toBeInTheDocument();
    expect(screen.queryByTestId("metabot-ask")).not.toBeInTheDocument();
  });

  it("renders the query builder when metabot is disabled", async () => {
    setup({ isMetabotEnabled: false });

    expect(await screen.findByTestId("query-builder")).toBeInTheDocument();
    expect(screen.queryByTestId("metabot-ask")).not.toBeInTheDocument();
  });
});
