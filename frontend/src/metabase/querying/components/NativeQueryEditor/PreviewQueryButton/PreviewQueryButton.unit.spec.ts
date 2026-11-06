import { createMockMetadata } from "__support__/metadata";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import NativeQuery from "metabase-lib/v1/queries/NativeQuery";
import { createMockNativeQuerySnippet } from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { PreviewQueryButton } from "./PreviewQueryButton";

const METADATA = createMockMetadata({
  databases: [createSampleDatabase()],
  snippets: [createMockNativeQuerySnippet({ name: "Foo", content: "'foo'" })],
});

interface SetupOpts {
  queryText: string;
}

function setup({ queryText }: SetupOpts) {
  const emptyQuery = new NativeQuery(
    Question.create({ DEPRECATED_RAW_MBQL_type: "native", metadata: METADATA }),
    Lib.createTestJsNativeQuery(SAMPLE_PROVIDER, { query: "" }),
  );
  return emptyQuery.setQueryText(queryText).question();
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
