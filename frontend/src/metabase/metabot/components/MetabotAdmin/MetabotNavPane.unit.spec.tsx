import { Route } from "react-router";

import { renderWithProviders, screen } from "__support__/ui";
import { createMockSettingsState } from "metabase-types/store/mocks";

import { MetabotNavPane } from "./MetabotNavPane";

const setup = ({
  isConfigured = true,
}: {
  isConfigured?: boolean;
} = {}) =>
  renderWithProviders(
    <Route path="/admin/metabot*" component={MetabotNavPane} />,
    {
      withRouter: true,
      initialRoute: "/admin/metabot/setup",
      storeInitialState: {
        settings: createMockSettingsState({
          "llm-metabot-configured?": isConfigured,
        }),
      },
    },
  );

describe("MetabotNavPane", () => {
  it("should not show metabots if it isn't configured", async () => {
    setup({ isConfigured: false });

    expect(screen.queryByText("Metabot")).not.toBeInTheDocument();
    expect(screen.queryByText("Embedded Metabot")).not.toBeInTheDocument();
  });

  it("should show metabots if it is configured", async () => {
    setup({ isConfigured: true });

    expect(await screen.findByText("Metabot")).toBeInTheDocument();
    expect(await screen.findByText("Embedded Metabot")).toBeInTheDocument();
  });
});
