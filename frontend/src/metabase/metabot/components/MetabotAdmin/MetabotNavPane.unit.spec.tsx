import { Route } from "react-router";

import { renderWithProviders, screen } from "__support__/ui";
import { createMockSettingsState } from "metabase-types/store/mocks";

import { MetabotNavPane } from "./MetabotNavPane";

const setup = ({
  isConfigured = true,
  isHosted = false,
}: {
  isConfigured?: boolean;
  isHosted?: boolean;
} = {}) =>
  renderWithProviders(
    <Route path="/admin/metabot*" component={MetabotNavPane} />,
    {
      withRouter: true,
      initialRoute: "/admin/metabot/setup",
      storeInitialState: {
        settings: createMockSettingsState({
          "llm-metabot-configured?": isConfigured,
          "is-hosted?": isHosted,
        }),
      },
    },
  );

describe("MetabotNavPane", () => {
  it("should not show metabots if it isn't configured", () => {
    setup({ isConfigured: false });

    expect(screen.queryByText("Metabot")).not.toBeInTheDocument();
    expect(screen.queryByText("Embedded Metabot")).not.toBeInTheDocument();
  });

  it("should not show Setup Metabot if it is hosted", () => {
    setup({ isHosted: true });

    expect(screen.queryByText("Setup Metabot")).not.toBeInTheDocument();
  });
});
