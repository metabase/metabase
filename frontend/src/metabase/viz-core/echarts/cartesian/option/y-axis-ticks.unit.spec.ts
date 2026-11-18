import { getDurationYAxisTicks } from "./y-axis-ticks";

it("keeps zero tick on padded duration axis with negative values", () => {
  const axis = getDurationYAxisTicks(
    [-99, 3723],
    { type: "value", boundaryGap: [0.03, 0] },
    4,
    {},
  );

  expect(axis).toMatchObject({ interval: 1800, min: -1800, max: 5400 });
});

it("keeps duration axis within segment limit after rounding its bounds", () => {
  const axis = getDurationYAxisTicks(
    [7, 27],
    { type: "value", scale: true },
    2,
    {},
  );

  expect(axis).toMatchObject({ interval: 15, min: 0, max: 30 });
});
