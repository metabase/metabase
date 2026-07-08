import { DATA_APP_EMBED_PREFIX } from "metabase/urls";

import { readNameFromUrl } from "./read-name-from-url";

const setup = (path: string) => {
  window.history.replaceState({}, "", path);

  return { name: readNameFromUrl() };
};

describe("readNameFromUrl", () => {
  afterEach(() => window.history.replaceState({}, "", "/"));

  it.each<[string, string | null]>([
    [`${DATA_APP_EMBED_PREFIX}/sales`, "sales"],
    [`${DATA_APP_EMBED_PREFIX}/sales/orders/42`, "sales"],
    [`${DATA_APP_EMBED_PREFIX}/my%20app`, "my app"],
    ["/embed/something/else", null],
    [DATA_APP_EMBED_PREFIX, null],
  ])("reads the name from %p as %p", (path, expected) => {
    expect(setup(path).name).toBe(expected);
  });
});
