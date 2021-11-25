import { stack, stackOffsetDiverging } from "./stack";

describe("stack", () => {
  const data = [
    [
      { x: 1, y: 100 },
      { x: 2, y: 100 },
    ],
    [
      { x: 1, y: 200 },
      { x: 2, y: -200 },
    ],
    [
      { x: 1, y: 300 },
      { x: 2, y: 300 },
    ],
  ];

  it("should stack series by default", () => {
    stack()(data);

    expect(data).toEqual([
      [
        { x: 1, y: 100, y0: 0 },
        { x: 2, y: 100, y0: 0 },
      ],
      [
        { x: 1, y: 200, y0: 100 },
        { x: 2, y: -200, y0: 100 },
      ],
      [
        { x: 1, y: 300, y0: 300 },
        { x: 2, y: 300, y0: -100 },
      ],
    ]);
  });

  it("should stack series with separate positive and negative tracks", () => {
    stack().offset(stackOffsetDiverging)(data);

    expect(data).toEqual([
      [
        { x: 1, y: 100, y0: 0 },
        { x: 2, y: 100, y0: 0 },
      ],
      [
        { x: 1, y: 200, y0: 100 },
        { x: 2, y: -200, y0: 0 },
      ],
      [
        { x: 1, y: 300, y0: 300 },
        { x: 2, y: 300, y0: 100 },
      ],
    ]);
  });
});
