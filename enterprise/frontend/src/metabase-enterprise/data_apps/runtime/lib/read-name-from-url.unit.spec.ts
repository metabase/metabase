import { readNameFromUrl } from "./read-name-from-url";

const setup = (path: string) => {
  window.history.replaceState({}, "", path);

  return { name: readNameFromUrl() };
};

describe("readNameFromUrl", () => {
  const originalRoot = window.MetabaseRoot;
  afterEach(() => {
    window.history.replaceState({}, "", "/");
    window.MetabaseRoot = originalRoot;
  });

  it("reads an embedded app under a Metabase installation subpath", () => {
    window.MetabaseRoot = "/mb/";
    expect(setup("/mb/embed/embedded-apps/sales/orders").name).toBe("sales");
  });

  it.each<[string, string | null]>([
    ["/embed/apps/sales", "sales"],
    ["/embed/apps/sales/orders/42", "sales"],
    ["/embed/apps/my%20app", "my app"],
    ["/embed/embedded-apps/sales", "sales"],
    ["/embed/embedded-apps/sales/orders/42?active=true", "sales"],
    ["/embed/embedded-apps", null],
    ["/embed/something/else", null],
    ["/embed/apps", null],
  ])("reads the name from %p as %p", (path, expected) => {
    expect(setup(path).name).toBe(expected);
  });
});
