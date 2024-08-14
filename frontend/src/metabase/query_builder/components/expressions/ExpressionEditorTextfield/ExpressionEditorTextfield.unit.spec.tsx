import { createMockMetadata } from "__support__/metadata";
import { getColumnIcon } from "metabase/common/utils/columns";
import { createQuery } from "metabase-lib/test-helpers";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { suggestWithExtras } from "./ExpressionEditorTextfield";

const METADATA = createMockMetadata({
  databases: [createSampleDatabase()],
});

type SetupOpts = {
  startRule: string;
  expressionIndex?: number;
};

function setup({ startRule, expressionIndex }: SetupOpts) {
  const query = createQuery({ metadata: METADATA });
  const stageIndex = 0;
  const { suggestions } = suggestWithExtras({
    source: "",
    query,
    stageIndex,
    expressionIndex,
    metadata: METADATA,
    startRule,
    getColumnIcon,
    showMetabaseLinks: true,
  });

  return suggestions;
}

describe("suggestWithFooters", () => {
  it("should return correct functions link for expressions", () => {
    const suggestions = setup({ startRule: "expression" });

    expect(suggestions.find(suggestion => "footer" in suggestion)).toEqual({
      footer: true,
      name: "Documentation",
      icon: "external",
      href: "https://www.metabase.com/docs/latest/questions/query-builder/expressions-list#functions",
    });
  });

  it("should return correct functions link for filters", () => {
    const suggestions = setup({ startRule: "boolean" });
    expect(suggestions.find(suggestion => "footer" in suggestion)).toEqual({
      footer: true,
      name: "Documentation",
      icon: "external",
      href: "https://www.metabase.com/docs/latest/questions/query-builder/expressions-list#functions",
    });
  });

  it("should return correct functions link for aggregations", () => {
    const suggestions = setup({ startRule: "aggregation" });
    expect(suggestions.find(suggestion => "footer" in suggestion)).toEqual({
      footer: true,
      name: "Documentation",
      icon: "external",
      href: "https://www.metabase.com/docs/latest/questions/query-builder/expressions-list#aggregations",
    });
  });
});
