import { createMockMetadata } from "__support__/metadata";
import * as Lib from "metabase-lib";
import { createMetadataProvider } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import { createMockNativeQuerySnippet } from "metabase-types/api/mocks";
import {
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { PreviewQueryButton } from "./PreviewQueryButton";

const METADATA = createMockMetadata({
  databases: [createSampleDatabase()],
  snippets: [createMockNativeQuerySnippet({ name: "Foo", content: "'foo'" })],
});

interface SetupOpts {
  queryText: string;
}

function setup({ queryText }: SetupOpts) {
  const provider = createMetadataProvider({
    databaseId: SAMPLE_DB_ID,
    metadata: METADATA,
  });
  return Question.create({ metadata: METADATA }).setQuery(
    Lib.createTestNativeQuery(provider, { query: queryText }),
  );
}

describe("PreviewQueryButton.shouldRender", () => {
  it("should render for a query with a snippet (metabase#60534)", () => {
    const question = setup({ queryText: "select {{snippet: Foo}}" });
    expect(PreviewQueryButton.shouldRender({ question })).toBe(true);
  });

  it("should render for a query with a variable", () => {
    const question = setup({ queryText: "select {{x}}" });
    expect(PreviewQueryButton.shouldRender({ question })).toBe(true);
  });

  it("should not render for a query without snippets and variables", () => {
    const question = setup({ queryText: "select 'foo'" });
    expect(PreviewQueryButton.shouldRender({ question })).toBe(false);
  });
});
