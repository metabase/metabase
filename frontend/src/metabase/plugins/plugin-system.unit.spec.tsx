import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import type { TokenFeatures } from "metabase-types/api";
import { createMockTokenFeatures } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { PLUGIN_IS_EE_BUILD, PLUGIN_RESOURCE_DOWNLOADS } from ".";

const TestComponent = () => {
  const isRunningEELogic =
    PLUGIN_RESOURCE_DOWNLOADS.areDownloadsEnabled({
      hide_download_button: true,
    }) === false;

  const isEeBuild = PLUGIN_IS_EE_BUILD.isEEBuild();

  return (
    <div>
      <div>{isRunningEELogic ? "ee-logic" : "oss-logic"}</div>
      <div>{isEeBuild ? "ee-build" : "oss-build"}</div>
    </div>
  );
};

const setup = ({
  eeBuild,
  tokenFeatures = {},
}: {
  eeBuild: boolean;
  tokenFeatures: Partial<TokenFeatures>;
}) => {
  const initialState = createMockState({
    settings: mockSettings({
      "token-features": createMockTokenFeatures(tokenFeatures),
    }),
  });

  setupEnterprisePlugins(eeBuild);

  renderWithProviders(<TestComponent />, {
    storeInitialState: initialState,
  });
};

describe("EE_PLUGINS_SYSTEM", () => {
  // do multiple runs to make sure we're cleaning things properly
  describe.each([1, 2, 3])("run %s", () => {
    it("should use oss plugins by default", () => {
      setup({ eeBuild: false, tokenFeatures: {} });
      expect(screen.getByText("oss-build")).toBeInTheDocument();
      expect(screen.getByText("oss-logic")).toBeInTheDocument();
    });

    it("should use ee logic when the whitelabel feature is enabled", () => {
      setup({ eeBuild: true, tokenFeatures: { whitelabel: true } });
      expect(screen.getByText("ee-build")).toBeInTheDocument();
      expect(screen.getByText("ee-logic")).toBeInTheDocument();
    });

    it("should use oss logic when ee build but the whitelabel feature is disabled", () => {
      setup({ eeBuild: true, tokenFeatures: { whitelabel: false } });
      expect(screen.getByText("ee-build")).toBeInTheDocument();
      expect(screen.getByText("oss-logic")).toBeInTheDocument();
    });
  });
});
