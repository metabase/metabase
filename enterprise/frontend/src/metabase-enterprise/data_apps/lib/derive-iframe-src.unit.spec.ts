import { deriveIframeSrc } from "./derive-iframe-src";

const setup = (parentPath: string, name: string) => {
  window.history.replaceState({}, "", parentPath);

  return { src: deriveIframeSrc(name) };
};

describe("deriveIframeSrc", () => {
  afterEach(() => window.history.replaceState({}, "", "/"));

  it.each<[string, string, string]>([
    ["/data-app/sales", "sales", "/embed/data-app/sales"],
    ["/data-app/sales/orders/42", "sales", "/embed/data-app/sales/orders/42"],
    ["/somewhere/else", "sales", "/embed/data-app/sales"],
    ["/data-app/my%20app/page", "my app", "/embed/data-app/my%20app/page"],
  ])(
    "maps parent %p (name %p) to iframe src %p",
    (parentPath, name, expected) => {
      expect(setup(parentPath, name).src).toBe(expected);
    },
  );
});
