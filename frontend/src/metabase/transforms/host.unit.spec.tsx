import { renderHookWithProviders } from "__support__/ui";

import { useTransformHost } from "./host";

function setup(initialRoute: string) {
  return renderHookWithProviders(() => useTransformHost(), {
    initialRoute,
    withRouter: true,
  });
}

describe("useTransformHost", () => {
  it("defaults to the main app", () => {
    const { result } = setup("/data-studio/transforms");

    expect(result.current.worktreeId).toBeNull();
    expect(result.current.rootUrl).toBe("/data-studio/transforms");
  });

  it("creates into the branch named by the URL", () => {
    const { result } = setup("/data-studio/transforms/new/python?worktreeId=7");

    expect(result.current.worktreeId).toBe(7);
  });

  it("keeps its own links out of the branch", () => {
    const { result } = setup("/data-studio/transforms/new/python?worktreeId=7");

    expect(result.current.rootUrl).toBe("/data-studio/transforms");
    expect(result.current.getNewTransformUrl("query")).toBe(
      "/data-studio/transforms/new/query",
    );
  });
});
