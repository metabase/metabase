import { deriveIframeSrc } from "./derive-iframe-src";

const setup = (parentPath: string, name: string) => {
  window.history.replaceState({}, "", parentPath);

  return { src: deriveIframeSrc(name) };
};

describe("deriveIframeSrc", () => {
  afterEach(() => window.history.replaceState({}, "", "/"));

  it.each<[string, string, string]>([
    ["/apps/sales", "sales", "/embed/apps/sales"],
    ["/apps/sales/orders/42", "sales", "/embed/apps/sales/orders/42"],
    ["/somewhere/else", "sales", "/embed/apps/sales"],
    ["/apps/my%20app/page", "my app", "/embed/apps/my%20app/page"],
  ])(
    "maps parent %p (name %p) to iframe src %p",
    (parentPath, name, expected) => {
      expect(setup(parentPath, name).src).toBe(expected);
    },
  );
});
