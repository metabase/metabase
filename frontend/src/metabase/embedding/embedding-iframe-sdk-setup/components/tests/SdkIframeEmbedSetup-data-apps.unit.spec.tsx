import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { screen, waitFor } from "__support__/ui";
import type { SdkIframeEmbedSetupModalInitialState } from "metabase/embedding/types";
import { PLUGIN_EMBEDDING_IFRAME_SDK_SETUP } from "metabase/plugins";
import { createMockDataApp } from "metabase-types/api/mocks";

import { setup } from "./test-setup";

jest.mock("metabase-enterprise/settings", () => ({
  hasPremiumFeature: () => true,
}));

const setupDataApps = (initialState?: SdkIframeEmbedSetupModalInitialState) => {
  PLUGIN_EMBEDDING_IFRAME_SDK_SETUP.isEnabled = () => true;
  setupEnterpriseOnlyPlugin("data_apps");
  fetchMock.get("path:/api/apps", [
    createMockDataApp({ name: "boba-hq", display_name: "Boba HQ" }),
    createMockDataApp({ name: "sales", display_name: "Sales" }),
  ]);

  setup({
    modularEmbeddingEnabled: true,
    jwtReady: true,
    dataAppsEnabled: true,
    initialState,
  });
};

describe("data app embedding setup", () => {
  it("opens with the data app selected, previews it, and generates its SSO snippet", async () => {
    setupDataApps({ resourceType: "data-app", resourceId: "boba-hq" });

    expect(screen.getByRole("radio", { name: /Data App/ })).toBeChecked();
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Data app" })).toHaveValue(
        "Boba HQ",
      ),
    );
    expect(screen.getByTitle("Data app preview")).toHaveAttribute(
      "src",
      `${window.location.origin}/embed/apps/boba-hq`,
    );

    await userEvent.click(screen.getByRole("button", { name: "Get code" }));

    const snippet = await screen.findByTestId("embed-code-snippet");
    expect(snippet).toHaveTextContent(
      '<metabase-data-app path="boba-hq"></metabase-data-app>',
    );
    expect(
      screen.queryByRole("radio", {
        name: "Existing session (local testing only)",
      }),
    ).not.toBeInTheDocument();
    expect(snippet).not.toHaveTextContent("useExistingUserSession");
    expect(snippet).not.toHaveTextContent('"isGuest": true');

    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("textbox", { name: "Data app" })).toHaveValue(
      "Boba HQ",
    );
  });

  it("lets the user select and change data apps from the dropdown", async () => {
    setupDataApps({ isGuest: true });

    await userEvent.click(screen.getByRole("radio", { name: /Data App/ }));
    expect(screen.getByRole("button", { name: "Get code" })).toBeDisabled();
    await userEvent.click(screen.getByRole("textbox", { name: "Data app" }));
    await userEvent.click(
      await screen.findByRole("option", { name: "Boba HQ" }),
    );
    expect(screen.getByTitle("Data app preview")).toHaveAttribute(
      "src",
      `${window.location.origin}/embed/apps/boba-hq`,
    );

    await userEvent.click(screen.getByRole("textbox", { name: "Data app" }));
    await userEvent.click(await screen.findByRole("option", { name: "Sales" }));
    expect(screen.getByTitle("Data app preview")).toHaveAttribute(
      "src",
      `${window.location.origin}/embed/apps/sales`,
    );
    await userEvent.click(screen.getByRole("button", { name: "Get code" }));
    const snippet = await screen.findByTestId("embed-code-snippet");
    expect(snippet).toHaveTextContent(
      '<metabase-data-app path="sales"></metabase-data-app>',
    );
    expect(snippet).not.toHaveTextContent('"isGuest": true');
  });

  it("hides the data app option without the data apps feature", async () => {
    setup();

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Change dashboard" }),
      ).toHaveTextContent("Dashboard"),
    );

    expect(
      screen.queryByRole("radio", { name: /Data App/ }),
    ).not.toBeInTheDocument();
  });
});
