import { Route } from "react-router";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { AdditionalHelpButtonGroup } from "./AdditionalHelpButtonGroup";

interface SetupParams {
  showMetabaseLinks?: boolean;
  whitelabel?: boolean;
  isAdmin?: boolean;
}

const setup = (params?: SetupParams) => {
  const {
    showMetabaseLinks = true,
    isAdmin = true,
    whitelabel = false,
  } = params || {};
  const storeInitialState = createMockState({
    currentUser: createMockUser({ is_superuser: isAdmin }),
    settings: mockSettings({
      "show-metabase-links": showMetabaseLinks,
      "token-features": createMockTokenFeatures({ whitelabel }),
    }),
  });

  if (whitelabel) {
    setupEnterprisePlugins();
  }

  renderWithProviders(
    <Route path="*" component={AdditionalHelpButtonGroup} />,
    {
      storeInitialState,
      withRouter: true,
    },
  );
};

describe("AdditionalHelpButtonGroup", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should render expected help links", () => {
    setup({ isAdmin: true, showMetabaseLinks: true });
    expect(
      screen.getByRole("link", { name: /Read the docs/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Invite a teammate to help you/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Contact Support" }),
    ).toBeInTheDocument();
  });

  it("hide 'Read the docs' link when showMetabaseLinks is false & whitelabel feature is enabled", () => {
    setup({ showMetabaseLinks: false, whitelabel: true });
    expect(
      screen.queryByRole("link", { name: /Read the docs/ }),
    ).not.toBeInTheDocument();
  });

  it("hide 'Invite a teammate to help you' link when user is not an admin", () => {
    setup({ isAdmin: false });
    expect(
      screen.queryByRole("link", { name: /Invite a teammate to help you/ }),
    ).not.toBeInTheDocument();
  });
});
