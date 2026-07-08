import { DATA_APP_EMBED_PREFIX, dataApp } from "metabase/urls";

import { deriveIframeSrc } from "./derive-iframe-src";

const setup = (parentPath: string, name: string) => {
  window.history.replaceState({}, "", parentPath);

  return { src: deriveIframeSrc(name) };
};

describe("deriveIframeSrc", () => {
  afterEach(() => window.history.replaceState({}, "", "/"));

  it.each<[string, string, string]>([
    [dataApp("sales"), "sales", `${DATA_APP_EMBED_PREFIX}/sales`],
    [
      `${dataApp("sales")}/orders/42`,
      "sales",
      `${DATA_APP_EMBED_PREFIX}/sales/orders/42`,
    ],
    ["/somewhere/else", "sales", `${DATA_APP_EMBED_PREFIX}/sales`],
    [
      `${dataApp("my app")}/page`,
      "my app",
      `${DATA_APP_EMBED_PREFIX}/my%20app/page`,
    ],
  ])(
    "maps parent %p (name %p) to iframe src %p",
    (parentPath, name, expected) => {
      expect(setup(parentPath, name).src).toBe(expected);
    },
  );
});
