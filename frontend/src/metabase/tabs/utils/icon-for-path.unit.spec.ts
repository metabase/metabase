import { iconForPath } from "./icon-for-path";

describe("iconForPath", () => {
  it.each([
    ["/admin/people", "gear"],
    ["/metabot", "metabot"],
    ["/dashboard/3", "dashboard"],
    ["/model/4", "model"],
    ["/question/5", "table"],
    ["/collection/root", "folder"],
    ["/browse/databases", "database"],
    ["/something-else", "document"],
  ] as const)("maps %s -> %s", (path, icon) => {
    expect(iconForPath(path)).toBe(icon);
  });
});
