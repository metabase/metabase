import { Route } from "react-router";

import {
  setupPropertiesEndpoints,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import type { TokenFeatures } from "metabase-types/api";
import {
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { EnableTransformsPage } from "./EnableTransformsPage";

type SetupOpts = {
  isAdmin?: boolean;
  tokenFeatures?: Partial<TokenFeatures>;
};

const setup = ({ isAdmin = true, tokenFeatures = {} }: SetupOpts = {}) => {
  setupPropertiesEndpoints(createMockSettings());
  setupUserMetabotPermissionsEndpoint();
  const state = createMockState({
    currentUser: createMockUser({ is_superuser: isAdmin }),
    settings: mockSettings({
      "token-features": createMockTokenFeatures(tokenFeatures),
    }),
  });

  const path = "/transforms";
  renderWithProviders(<Route path={path} component={EnableTransformsPage} />, {
    storeInitialState: state,
    withRouter: true,
    initialRoute: path,
  });
};

const ADMINS_ONLY_COPY = "Only Admins can create and run transforms";
const ANALYSTS_AND_ADMINS_COPY =
  "Only Analysts and Admins can create and run transforms";

describe("EnableTransformsPage", () => {
  describe("Permissioned card copy", () => {
    it("shows admins-only copy on OSS", () => {
      setup({ tokenFeatures: {} });

      expect(screen.getByText(ADMINS_ONLY_COPY)).toBeInTheDocument();
      expect(
        screen.queryByText(ANALYSTS_AND_ADMINS_COPY),
      ).not.toBeInTheDocument();
    });

    it("shows analysts-and-admins copy on Pro self-hosted", () => {
      setup({ tokenFeatures: { advanced_permissions: true } });

      expect(screen.getByText(ANALYSTS_AND_ADMINS_COPY)).toBeInTheDocument();
      expect(screen.queryByText(ADMINS_ONLY_COPY)).not.toBeInTheDocument();
    });
  });
});
