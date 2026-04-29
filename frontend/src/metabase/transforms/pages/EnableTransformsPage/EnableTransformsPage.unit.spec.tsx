import { Route } from "react-router";

import { createScenario } from "__support__/scenarios";
import { setupDatabaseListEndpoint } from "__support__/server-mocks";
import { screen } from "__support__/ui";
import type { TokenFeatures } from "metabase-types/api";

import { EnableTransformsPage } from "./EnableTransformsPage";

type SetupOpts = {
  isAdmin?: boolean;
  tokenFeatures?: Partial<TokenFeatures>;
};

const setup = ({ isAdmin = true, tokenFeatures = {} }: SetupOpts = {}) => {
  setupDatabaseListEndpoint([]);

  const path = "/transforms";
  const { render } = createScenario()
    .withUser({ is_superuser: isAdmin })
    .withEnterprise({ tokenFeatures })
    .build();

  render(<Route path={path} component={EnableTransformsPage} />, {
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
