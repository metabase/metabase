import { readSlugFromUrl } from "./read-slug-from-url";

const setup = (path: string) => {
  window.history.replaceState({}, "", path);

  return { slug: readSlugFromUrl() };
};

describe("readSlugFromUrl", () => {
  const originalRoot = window.MetabaseRoot;

  afterEach(() => {
    window.history.replaceState({}, "", "/");
    window.MetabaseRoot = originalRoot;
  });

  it("reads an embedded app under a Metabase installation subpath", () => {
    window.MetabaseRoot = "/mb/";

    expect(setup("/mb/embed/embedded-apps/sales/orders").slug).toBe("sales");
  });

  it.each<[string, string | null]>([
    ["/embed/apps/sales", "sales"],
    ["/embed/apps/sales/orders/42", "sales"],
    ["/embed/apps/my%20app", "my app"],
    ["/embed/embedded-apps/sales", "sales"],
    ["/embed/embedded-apps/sales/orders/42?active=true", "sales"],
    ["/embed/embedded-apps/sales%", null],
    ["/embed/apps/sales%", null],
    ["/embed/embedded-apps", null],
    ["/embed/something/else", null],
    ["/embed/apps", null],
  ])("reads the slug from %p as %p", (path, expected) => {
    expect(setup(path).slug).toBe(expected);
  });
});
