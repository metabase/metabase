import type { ENTERPRISE_PLUGIN_NAME } from "__support__/enterprise-typed";
import { createMockMetadata } from "__support__/metadata";
import { createScenario } from "__support__/scenarios";
import { getHelpText } from "metabase/querying/expressions";
import { checkNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import {
  DEFAULT_TEST_QUERY,
  createMetadataProvider,
} from "metabase-lib/test-helpers";
import type { TokenFeatures } from "metabase-types/api";
import {
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { HelpText, type HelpTextProps } from "../HelpText";

export interface SetupOpts {
  enclosingFunction?: Partial<HelpTextProps["enclosingFunction"]>;
  reportTimezone?: string;

  showMetabaseLinks?: boolean;
  enterprisePlugins?: ENTERPRISE_PLUGIN_NAME[];
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
  const metadata = createMockMetadata({ databases: [createSampleDatabase()] });
  const provider = createMetadataProvider({
    databaseId: SAMPLE_DB_ID,
    metadata,
  });
  const database = checkNotNull(metadata.database(SAMPLE_DB_ID));
  const query = Lib.createTestQuery(provider, DEFAULT_TEST_QUERY);

  const props: HelpTextProps = {
    enclosingFunction: {
      arg: null,
      name: "concat",
      ...enclosingFunction,
    },
    query,
    metadata,
    reportTimezone,
    expressionMode,
  };

  const { render } = createScenario()
    .withSettings({ "show-metabase-links": showMetabaseLinks })
    .withEnterprise({ plugins: enterprisePlugins, tokenFeatures })
    .build();

  render(<HelpText {...props} />);

  const helpText = getHelpText(
    checkNotNull(enclosingFunction?.name),
    database,
    reportTimezone,
  );

  return { database, metadata, helpText };
}
