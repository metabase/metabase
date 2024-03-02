import { createMockCollection } from "metabase-types/api/mocks";

import { getCrumbs } from "./collections";

const collectionsById = {
  root: createMockCollection({ id: "root", name: "Our analytics", path: [] }),
  1: createMockCollection({ id: 1, name: "parent", path: ["root"] }),
  2: createMockCollection({ id: 2, name: "child", path: ["root", 1] }),
};

describe("getCrumbs", () => {
  it("returns path starting from root", () => {
    const crumbs = getCrumbs(collectionsById[2], collectionsById, jest.fn());

    expect(crumbs).toMatchObject([
      ["Our analytics", expect.any(Function)],
      ["parent", expect.any(Function)],
      ["child"],
    ]);
  });

  it("makes collection step functions calling the callback with the collection id", () => {
    const callbackMock = jest.fn();
    const crumbs = getCrumbs(collectionsById[2], collectionsById, callbackMock);

    const [_rootName, rootCallback] = crumbs[0];
    (rootCallback as any)();
    expect(callbackMock).toHaveBeenCalledWith("root");

    const [_parentName, parentCallback] = crumbs[1];
    (parentCallback as any)();
    expect(callbackMock).toHaveBeenCalledWith(1);
  });
});
