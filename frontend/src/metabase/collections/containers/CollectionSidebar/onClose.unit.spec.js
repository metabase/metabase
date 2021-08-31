import { onClose } from "./onClose";

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

const openCollections = [2, 1, 0];

it("onClose", () => {
  const newOpenCollections = onClose(0, collections, openCollections);

  expect(newOpenCollections).toStrictEqual([]);
});
