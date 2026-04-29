import { setupEnterprisePlugins } from "__support__/enterprise";
import { createScenario } from "__support__/scenarios";
import { screen } from "__support__/ui";

import { CommunityLocalizationNotice } from "./CommunityLocalizationNotice";

function setup({
  isAdminView,
  isWhiteLabeling,
}: {
  isAdminView: boolean;
  isWhiteLabeling: boolean;
}) {
  const { render } = createScenario()
    .withSettings({
      "application-name": isWhiteLabeling ? "Basemeta" : "Metabase",
      "show-metabase-links": !isWhiteLabeling,
    })
    .withEnterprise({ tokenFeatures: { whitelabel: isWhiteLabeling } })
    .build();

  if (isWhiteLabeling) {
    setupEnterprisePlugins();
  }

  render(<CommunityLocalizationNotice isAdminView={isAdminView} />);
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
