import { fullDuration } from "./time";

describe("lib/formatting/time", () => {
  const dataSet = [
    {
      input: 283,
      expected: "283 ms",
    },
    {
      input: 58_003,
      expected: "58 s 3 ms",
    },
    {
      input: 62_005,
      expected: "1 min 2 s 5 ms",
    },
    {
      input: 142_015,
      expected: "2 mins 22 s 15 ms",
    },
    {
      input: 3_675_012,
      expected: "1 hr 1 min 15 s 12 ms",
    },
  ];

  it.each(dataSet)(
    "formats $input to $expected properly",
    ({ input, expected }) => {
      const formatted = fullDuration(input);
      expect(formatted).toStrictEqual(expected);
    },
  );
});
