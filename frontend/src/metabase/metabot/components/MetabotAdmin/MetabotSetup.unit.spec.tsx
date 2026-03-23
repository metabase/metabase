import { Route } from "react-router";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockSettingsState } from "metabase-types/store/mocks";

import { MetabotSetup } from "./MetabotSetup";

jest.mock("./MetabotNavPane", () => ({
  MetabotNavPane: () => <div>Metabot navigation</div>,
}));

jest.mock("./MetabotProviderSection", () => ({
  MetabotProviderSection: () => <div>Provider section</div>,
}));

const setup = ({
  isHosted = false,
}: {
  isHosted?: boolean;
} = {}) =>
  renderWithProviders(
    <Route path="/admin/metabot*" component={MetabotSetup} />,
    {
      withRouter: true,
      initialRoute: "/admin/metabot/setup",
      storeInitialState: {
        settings: createMockSettingsState({
          "is-hosted?": isHosted,
        }),
      },
    },
  );

describe("MetabotSetup", () => {
  it("should redirect to the hosted Metabot page when hosted", async () => {
    const { history } = setup({ isHosted: true });

    await waitFor(() => {
      expect(history?.getCurrentLocation()?.pathname).toBe("/admin/metabot/");
    });
  });

  it("should not redirect to the hosted Metabot page when not hosted", async () => {
    const { history } = setup({ isHosted: false });

    await screen.findByText("Connect to AI Provider");

    expect(history?.getCurrentLocation()?.pathname).toBe(
      "/admin/metabot/setup",
    );
  });
});
