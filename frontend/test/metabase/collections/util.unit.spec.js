import { getParentPath } from "metabase/collections/utils";
describe("getParentPath", () => {
  it("should return the proper path to a child object", () => {
    const testList = [
      {
        id: 20,
      },
      {
        id: 1,
        children: [
          {
            id: 2,
            children: [
              {
                id: 3,
                children: [
                  {
                    id: 4,
                  },
                ],
              },
              {
                id: 7,
                children: [
                  {
                    id: 9,
                  },
                ],
              },
            ],
          },
          {
            id: 5,
            children: [
              {
                id: 6,
              },
            ],
          },
        ],
      },
    ];
    const expected = [1, 5, 6];
    const path = getParentPath(testList, 6);
    expect(path).toEqual(expected);
  });
});
