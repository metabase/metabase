import { t } from "ttag"; // Import 't'

import { createMockCollection } from "metabase-types/api/mocks";

import { getCrumbs } from "./collections";

// Mock 'ttag'
jest.mock("ttag", () => ({
  t: (strings: TemplateStringsArray) => strings.join(""),
}));

const collectionsById = {
  root: createMockCollection({ id: "root", name: "Our analytics", path: [] }),
  1: createMockCollection({ id: 1, name: "parent", path: ["root"] }),
  2: createMockCollection({ id: 2, name: "child", path: ["root", 1] }),
};

// O 'describe' começa aqui
describe("getCrumbs", () => {
  // Teste existente 1
  it("returns path starting from root", () => {
    const crumbs = getCrumbs(collectionsById[2], collectionsById, jest.fn());

    expect(crumbs).toMatchObject([
      ["Our analytics", expect.any(Function)],
      ["parent", expect.any(Function)],
      ["child"],
    ]);
  });

  // Teste existente 2
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

  // CT2 - D1-L2, D2-V: Coleção sem path, com root
  it("should return root crumb if collection has no path and root exists", () => {
    const callbackMock = jest.fn();
    const collection = createMockCollection({ id: 2, name: "Sub", path: null });
    const collectionsById = {
      root: createMockCollection({ id: "root", name: "Raiz", path: [] }),
    };

    const crumbs = getCrumbs(collection, collectionsById, callbackMock);

    expect(crumbs).toMatchObject([["Raiz", expect.any(Function)], ["Unknown"]]);

    const [_rootName, rootCallback] = crumbs[0];
    (rootCallback as any)();
    expect(callbackMock).toHaveBeenCalledWith("root");
  });

  // CT3 - D1-L2, D2-F: Coleção sem path, sem root
  it("should return only unknown if no path and no root", () => {
    const callbackMock = jest.fn();
    const collection = createMockCollection({ id: 2, name: "Sub", path: null });
    const collectionsById = {
      root: null,
    };

    const crumbs = getCrumbs(collection, collectionsById, callbackMock);
    expect(crumbs).toEqual([[t`Unknown`]]);
  });

  // CT4 - D1-L3, D2-V: Coleção nula, com root
  it("should return root crumb if collection is null and root exists", () => {
    const callbackMock = jest.fn();
    const collection = null;
    const collectionsById = {
      root: createMockCollection({ id: "root", name: "Raiz", path: [] }),
    };

    const crumbs = getCrumbs(collection, collectionsById, callbackMock);

    expect(crumbs).toMatchObject([["Raiz", expect.any(Function)], ["Unknown"]]);

    const [_rootName, rootCallback] = crumbs[0];
    (rootCallback as any)();
    expect(callbackMock).toHaveBeenCalledWith("root");
  });

  // CT5 - D1-L3, D2-F: Coleção nula, sem root
  it("should return only unknown if collection is null and no root", () => {
    const callbackMock = jest.fn();
    const collection = null;
    const collectionsById = {
      root: null,
    };

    const crumbs = getCrumbs(collection, collectionsById, callbackMock);
    expect(crumbs).toEqual([[t`Unknown`]]);
  });
});
