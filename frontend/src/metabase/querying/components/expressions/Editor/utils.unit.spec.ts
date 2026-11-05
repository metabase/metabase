import { EditorView } from "@codemirror/view";
import { renderHook } from "@testing-library/react";

import type * as Lib from "metabase-lib";

import { useInitialClause } from "./utils";

type SetupOpts = {
  initialExpressionClause: Lib.DefinedClauseName | null;
};

function setup({ initialExpressionClause }: SetupOpts) {
  const view = new EditorView({ doc: "" });
  const { result } = renderHook(() =>
    useInitialClause({ initialExpressionClause }),
  );
  result.current(view);
  return { source: view.state.doc.toString() };
}

describe("useInitialClause", () => {
  it.each<[Lib.DefinedClauseName, string]>([
    ["coalesce", "coalesce(value1, value2)"],
    ["case", "case(condition, output)"],
  ])("should insert the %s template", (clause, expectedSource) => {
    expect(setup({ initialExpressionClause: clause }).source).toBe(
      expectedSource,
    );
  });

  it("should insert nothing without an initial clause", () => {
    expect(setup({ initialExpressionClause: null }).source).toBe("");
  });
});
