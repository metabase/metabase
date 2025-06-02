import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockTokenFeatures } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { CommunityLocalizationNotice } from "./CommunityLocalizationNotice";

function setup(isAdminView: boolean, isWhiteLabeling: boolean) {
  const state = createMockState({
    settings: mockSettings({
      "application-name": isWhiteLabeling ? "Basemeta" : "Metabase",
      "token-features": createMockTokenFeatures({
        whitelabel: isWhiteLabeling,
      }),
    }),
  });

  if (isWhiteLabeling) {
    setupEnterprisePlugins();
  }

  renderWithProviders(
    <CommunityLocalizationNotice isAdminView={isAdminView} />,
    {
      storeInitialState: state,
    },
  );
}

describe("CommunityLocalizationNotice", () => {
  it("should render", () => {
    setup(false, false);
    expect(
      screen.getByText(
        "Some translations are created by the Metabase community, and might not be perfect.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/you can \./i)).toBeInTheDocument();
  });

  it("should not render link when white labeling is enabled", () => {
    setup(false, true);
    expect(
      screen.getByText(
        "Some translations are created by the Basemeta community, and might not be perfect.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/you can \./i)).not.toBeInTheDocument();
  });

  it("should render link for admins when white labeling is enabled", () => {
    setup(true, true);
    expect(
      screen.getByText(
        "Some translations are created by the Basemeta community, and might not be perfect.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/you can \./i)).toBeInTheDocument();
  });
});
