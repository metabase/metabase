import dayjs from "dayjs";

import { createMockRecentCollectionItem } from "metabase-types/api/mocks";

import { getRecentGroups } from "./utils";

const items = [
  createMockRecentCollectionItem({
    name: "This Week Q",
    timestamp: dayjs().subtract(2, "day").toISOString(),
  }),
  createMockRecentCollectionItem({
    name: "This Week Q2",
    timestamp: dayjs().subtract(6, "day").toISOString(),
  }),

  createMockRecentCollectionItem({
    name: "Yesterday Q1",
    timestamp: dayjs().subtract(25, "hour").toISOString(),
  }),
  createMockRecentCollectionItem({
    name: "Yesterday Q2",
    timestamp: dayjs().subtract(47, "hour").toISOString(),
  }),

  createMockRecentCollectionItem({
    name: "Today Q1",
    timestamp: dayjs().subtract(1, "hour").toISOString(),
  }),
  createMockRecentCollectionItem({
    name: "Today Q2",
    timestamp: dayjs().subtract(23, "hour").toISOString(),
  }),

  createMockRecentCollectionItem({
    name: "Old Q1",
    timestamp: dayjs().subtract(8, "day").toISOString(),
  }),
  createMockRecentCollectionItem({
    name: "Old Q2",
    timestamp: dayjs().subtract(12, "day").toISOString(),
  }),
  createMockRecentCollectionItem({
    name: "Old Q3",
    timestamp: dayjs().subtract(19, "day").toISOString(),
  }),
  createMockRecentCollectionItem({
    name: "Old Q4",
    timestamp: dayjs().subtract(400, "day").toISOString(),
  }),
];

describe("EntityPicker -> RecentsTab -> utils", () => {
  it("should group recent items into date buckets", () => {
    const groups = getRecentGroups(items);

    expect(groups).toEqual([
      { title: "Today", days: 1, items: [items[4], items[5]] },
      { title: "Yesterday", days: 2, items: [items[2], items[3]] },
      { title: "Last week", days: 7, items: [items[0], items[1]] },
      {
        title: "Earlier",
        days: Infinity,
        items: [items[6], items[7], items[8], items[9]],
      },
    ]);
  });

  it("should omit empty groups", () => {
    const groups = getRecentGroups(items.slice(2, 4));

    expect(groups).toEqual([
      { title: "Yesterday", days: 2, items: [items[2], items[3]] },
    ]);
  });
});
