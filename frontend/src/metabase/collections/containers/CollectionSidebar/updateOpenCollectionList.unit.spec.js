import { updateOpenCollectionList } from "./updateOpenCollectionList";

const collections = [
  {
    id: 0,
    children: [
      {
        id: 1,
        children: [
          {
            id: 2,
          },
        ],
      },
    ],
  },
  {
    id: 3,
    children: [
      {
        id: 4,
      },
    ],
  },
];

describe("when passed id is that of an ancestor collection", () => {
  it("when openCollections is in an order that does not reflect the order of the collections and their children", () => {
    const openCollections = [2, 1, 0];

    const newOpenCollections = updateOpenCollectionList(
      0,
      collections,
      openCollections,
    );

    expect(newOpenCollections).toStrictEqual([]);
  });

  it("when openCollections is in an order that reflects the order of the collections and their children", () => {
    const openCollections = [0, 1, 2];

    const newOpenCollections = updateOpenCollectionList(
      0,
      collections,
      openCollections,
    );

    expect(newOpenCollections).toStrictEqual([]);
  });

  it("when open collection to close is not the first in the openCollections array", () => {
    const openCollections = [3, 4];

    const newOpenCollections = updateOpenCollectionList(
      3,
      collections,
      openCollections,
    );

    expect(newOpenCollections).toStrictEqual([]);
  });
});

describe("when passed id is that of a child collection", () => {
  it("when openCollections is in an order that does not reflect the order of the collections and their children", () => {
    const openCollections = [2, 1, 0];

    const newOpenCollections = updateOpenCollectionList(
      1,
      collections,
      openCollections,
    );

    expect(newOpenCollections).toStrictEqual([0]);
  });
});
