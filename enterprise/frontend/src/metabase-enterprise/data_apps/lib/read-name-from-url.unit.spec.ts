import { readNameFromUrl } from "./read-name-from-url";

const setup = (path: string) => {
  window.history.replaceState({}, "", path);

  return { name: readNameFromUrl() };
};

describe("readNameFromUrl", () => {
  afterEach(() => window.history.replaceState({}, "", "/"));

  it.each<[string, string | null]>([
    ["/embed/data-app/sales", "sales"],
    ["/embed/data-app/sales/orders/42", "sales"],
    ["/embed/data-app/my%20app", "my app"],
    ["/embed/something/else", null],
    ["/embed/data-app", null],
  ])("reads the name from %p as %p", (path, expected) => {
    expect(setup(path).name).toBe(expected);
  });
});
