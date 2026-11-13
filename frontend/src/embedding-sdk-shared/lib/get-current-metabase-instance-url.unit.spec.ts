import { getCurrentMetabaseInstanceUrl } from "./get-current-metabase-instance-url";

describe("getCurrentMetabaseInstanceUrl", () => {
  const originalRoot = window.MetabaseRoot;

  afterEach(() => {
    window.MetabaseRoot = originalRoot;
  });

  it("uses the current origin when MetabaseRoot is missing", () => {
    window.MetabaseRoot = undefined;

    expect(getCurrentMetabaseInstanceUrl()).toBe(window.location.origin);
  });

  it("preserves subpath and removes trailing slashes", () => {
    window.MetabaseRoot = "/metabase///";

    expect(getCurrentMetabaseInstanceUrl()).toBe(
      `${window.location.origin}/metabase`,
    );
  });
});
