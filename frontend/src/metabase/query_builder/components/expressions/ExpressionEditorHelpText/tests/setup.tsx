import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import type { TokenFeatures } from "metabase-types/api";
import { createMockTokenFeatures } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import type { ExpressionEditorHelpTextProps } from "../ExpressionEditorHelpText";
import { ExpressionEditorHelpText } from "../ExpressionEditorHelpText";

export interface SetupOpts {
  helpText?: ExpressionEditorHelpTextProps["helpText"];
  showMetabaseLinks?: boolean;
  hasEnterprisePlugins?: boolean;
  tokenFeatures?: Partial<TokenFeatures>;
}

export async function setup({
  helpText,
  showMetabaseLinks = true,
  hasEnterprisePlugins,
  tokenFeatures = {},
}: SetupOpts) {
  const target = { current: null };

  const props: ExpressionEditorHelpTextProps = {
    helpText,
    width: 397,
    target,
  };

  const state = createMockState({
    settings: mockSettings({
      "show-metabase-links": showMetabaseLinks,
      "token-features": createMockTokenFeatures(tokenFeatures),
    }),
  });

  if (hasEnterprisePlugins) {
    setupEnterprisePlugins();
  }

  renderWithProviders(<ExpressionEditorHelpText {...props} />, {
    storeInitialState: state,
  });

  // have to wait for TippyPopover to render content
  expect(
    await screen.findByTestId("expression-helper-popover"),
  ).toBeInTheDocument();
}
