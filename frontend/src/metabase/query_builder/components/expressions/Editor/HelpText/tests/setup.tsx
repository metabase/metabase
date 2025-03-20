import { setupEnterprisePlugins } from "__support__/enterprise";
import { createMockMetadata } from "__support__/metadata";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import { createQuery } from "metabase-lib/test-helpers";
import { getHelpText } from "metabase-lib/v1/expressions/helper-text-strings";
import type { TokenFeatures } from "metabase-types/api";
import { createMockTokenFeatures } from "metabase-types/api/mocks";
import {
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";
import { createMockState } from "metabase-types/store/mocks";

import { HelpText, type HelpTextProps } from "../HelpText";

export interface SetupOpts {
  enclosingFunction?: Partial<HelpTextProps["enclosingFunction"]>;
  reportTimezone?: string;

  showMetabaseLinks?: boolean;
  hasEnterprisePlugins?: boolean;
  tokenFeatures?: Partial<TokenFeatures>;
}

export async function setup({
  enclosingFunction,
  reportTimezone = "America/Los_Angeles",
  showMetabaseLinks = true,
  hasEnterprisePlugins,
  tokenFeatures = {},
}: SetupOpts) {
  const state = createMockState({
    settings: mockSettings({
      "show-metabase-links": showMetabaseLinks,
      "token-features": createMockTokenFeatures(tokenFeatures),
    }),
  });

  const metadata = createMockMetadata({ databases: [createSampleDatabase()] });
  const database = checkNotNull(metadata.database(SAMPLE_DB_ID));
  const query = createQuery({
    databaseId: database.id,
  });

  const props: HelpTextProps = {
    enclosingFunction: {
      arg: null,
      name: "concat",
      ...enclosingFunction,
    },
    query,
    metadata,
    reportTimezone,
  };

  if (hasEnterprisePlugins) {
    setupEnterprisePlugins();
  }

  renderWithProviders(<HelpText {...props} />, {
    storeInitialState: state,
  });

  const helpText = getHelpText(
    checkNotNull(enclosingFunction?.name),
    database,
    reportTimezone,
  );

  return { database, metadata, helpText };
}
