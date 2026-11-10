import { readSlugFromUrl } from "./read-slug-from-url";

const setup = (path: string) => {
  window.history.replaceState({}, "", path);

  return { slug: readSlugFromUrl() };
};

describe("readSlugFromUrl", () => {
  afterEach(() => window.history.replaceState({}, "", "/"));

  it.each<[string, string | null]>([
    ["/embed/apps/sales", "sales"],
    ["/embed/apps/sales/orders/42", "sales"],
    ["/embed/apps/my%20app", "my app"],
    ["/embed/something/else", null],
    ["/embed/apps", null],
  ])("reads the slug from %p as %p", (path, expected) => {
    expect(setup(path).slug).toBe(expected);
  });
});
