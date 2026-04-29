import fetchMock from "fetch-mock";
import { Route } from "react-router";

import type { ENTERPRISE_PLUGIN_NAME } from "__support__/enterprise-typed";
import { createScenario } from "__support__/scenarios";
import { screen } from "__support__/ui";
import type { Settings, TokenFeatures } from "metabase-types/api";

import { EmbedHomepage } from "../EmbedHomepage";

export interface SetupOpts {
  tokenFeatures?: Partial<TokenFeatures>;
  enterprisePlugins?: ENTERPRISE_PLUGIN_NAME[];
  settings?: Partial<Settings>;
  isAdmin?: boolean;
}

export async function setup({
  tokenFeatures,
  enterprisePlugins,
  settings = {},
  isAdmin = false,
}: SetupOpts = {}) {
  jest.clearAllMocks();

  fetchMock.put("path:/api/setting/embedding-homepage", 200);
  fetchMock.post("path:/api/product-feedback", 200);

  const { render } = createScenario()
    .withUser({ is_superuser: isAdmin })
    .withSettings(settings as Record<string, unknown>)
    .withEnterprise({
      plugins: enterprisePlugins,
      tokenFeatures: tokenFeatures ?? {},
    })
    .build();

  render(<Route path="/" component={EmbedHomepage} />, {
    withRouter: true,
    withUndos: true,
  });
}

export const getLastHomepageSettingSettingCall = () =>
  fetchMock.callHistory.lastCall("path:/api/setting/embedding-homepage", {
    method: "PUT",
  });

export const getLastFeedbackCall = () =>
  fetchMock.callHistory.lastCall("path:/api/product-feedback", {
    method: "POST",
  });

export const queryFeedbackModal = () =>
  screen.queryByText("How can we improve embedding?");
