import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockTokenFeatures } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { CommunityLocalizationNotice } from "./CommunityLocalizationNotice";

function setup({
  isAdminView,
  isWhiteLabeling,
}: {
  isAdminView: boolean;
  isWhiteLabeling: boolean;
}) {
  const state = createMockState({
    settings: mockSettings({
      "application-name": isWhiteLabeling ? "Basemeta" : "Metabase",
      "token-features": createMockTokenFeatures({
        whitelabel: isWhiteLabeling,
      }),
      "show-metabase-links": !isWhiteLabeling,
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
  it("should render notice and link when white labeling is disabled", () => {
    setup({ isAdminView: false, isWhiteLabeling: false });
    expect(
      screen.getByText(
        "Some translations are created by the Metabase community, and might not be perfect.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/you can \./i)).toBeInTheDocument();
  });

  it("should render generic notice and skip link link when white labeling is enabled", () => {
    setup({ isAdminView: false, isWhiteLabeling: true });
    expect(
      screen.getByText(
        "Some translations are created by the community, and might not be perfect.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/you can \./i)).not.toBeInTheDocument();
  });

  it("should render link for admins when white labeling is enabled", () => {
    setup({ isAdminView: true, isWhiteLabeling: true });
    expect(
      screen.getByText(
        "Some translations are created by the Metabase community, and might not be perfect.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/you can \./i)).toBeInTheDocument();
  });
});
