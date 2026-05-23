import dayjs from "dayjs";

import { bucketForDate } from "./MetabotHistoryPopover";

describe("bucketForDate", () => {
  // local-time strings so the test is independent of Jest's runtime TZ;
  // bucketing in the component runs in local time.
  const now = dayjs("2026-05-23T15:00:00");

  it("buckets dates earlier today as 'today'", () => {
    expect(bucketForDate(dayjs("2026-05-23T01:00:00"), now)).toMatchObject({
      key: "today",
      rank: 0,
    });
  });

  it("buckets yesterday as 'yesterday'", () => {
    expect(bucketForDate(dayjs("2026-05-22T12:00:00"), now)).toMatchObject({
      key: "yesterday",
      rank: 1,
    });
  });

  it("buckets 3 days ago as 'prev7'", () => {
    expect(bucketForDate(dayjs("2026-05-20T12:00:00"), now)).toMatchObject({
      key: "prev7",
      rank: 2,
    });
  });

  it("buckets 20 days ago as 'prev30'", () => {
    expect(bucketForDate(dayjs("2026-05-03T12:00:00"), now)).toMatchObject({
      key: "prev30",
      rank: 3,
    });
  });

  it("buckets 2 months ago as a monthly bucket with the month label", () => {
    expect(bucketForDate(dayjs("2026-03-15T12:00:00"), now)).toMatchObject({
      key: "month-2026-03",
      rank: 4,
      label: "March 2026",
    });
  });
});
