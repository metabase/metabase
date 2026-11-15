import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { getHelpText } from "metabase/querying/expressions";
import { checkNotNull } from "metabase/utils/types";
import type * as Lib from "metabase-lib";
import type { TokenFeatures } from "metabase-types/api";
import { createMockTokenFeatures } from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { HelpText, type HelpTextProps } from "../HelpText";

export interface SetupOpts {
  enclosingFunction?: Partial<HelpTextProps["enclosingFunction"]>;
  reportTimezone?: string;

  showMetabaseLinks?: boolean;
  enterprisePlugins?: Parameters<typeof setupEnterpriseOnlyPlugin>[0][];
  tokenFeatures?: Partial<TokenFeatures>;
  expressionMode?: Lib.ExpressionMode;
}

export async function setup({
  enclosingFunction,
  reportTimezone = "America/Los_Angeles",
  showMetabaseLinks = true,
  enterprisePlugins,
  tokenFeatures = {},
  expressionMode = "expression",
}: SetupOpts) {
  const state = createMockState({
    settings: mockSettings({
      "show-metabase-links": showMetabaseLinks,
      "token-features": createMockTokenFeatures(tokenFeatures),
    }),
  });

  const database = createSampleDatabase();

  const props: HelpTextProps = {
    enclosingFunction: {
      arg: null,
      name: "concat",
      ...enclosingFunction,
    },
    database,
    reportTimezone,
    expressionMode,
  };

  if (enterprisePlugins) {
    enterprisePlugins.forEach(setupEnterpriseOnlyPlugin);
  }

  renderWithProviders(<HelpText {...props} />, {
    storeInitialState: state,
  });

  // The example expression is highlighted asynchronously; wait for it to
  // settle so its state update does not land after the test has finished.
  const example = screen.queryByTestId("helptext-example");
  if (example) {
    await waitFor(() => expect(example).not.toBeEmptyDOMElement());
  }

  const helpText = getHelpText(
    checkNotNull(enclosingFunction?.name),
    database,
    reportTimezone,
  );

  return { database, helpText };
}
