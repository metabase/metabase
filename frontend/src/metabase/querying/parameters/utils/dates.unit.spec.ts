import type { DatePickerValue } from "metabase/querying/filters/types";

import { deserializeDateFilter, serializeDateFilter } from "./dates";

type TestCase = {
  text: string;
  value: DatePickerValue;
};

describe("serializeDateFilter", () => {
  it.each<TestCase>([
    {
      text: "2020-01-02",
      value: {
        type: "specific",
        operator: "=",
        values: [new Date(2020, 0, 2)],
        hasTime: false,
      },
    },
    {
      text: "2020-01-02T00:00:00",
      value: {
        type: "specific",
        operator: "=",
        values: [new Date(2020, 0, 2)],
        hasTime: true,
      },
    },
    {
      text: "2020-01-02T10:20:00",
      value: {
        type: "specific",
        operator: "=",
        values: [new Date(2020, 0, 2, 10, 20)],
        hasTime: true,
      },
    },
    {
      text: "~2020-12-31",
      value: {
        type: "specific",
        operator: "<",
        values: [new Date(2020, 11, 31)],
        hasTime: false,
      },
    },
    {
      text: "~2020-12-31T10:20:00",
      value: {
        type: "specific",
        operator: "<",
        values: [new Date(2020, 11, 31, 10, 20)],
        hasTime: true,
      },
    },
    {
      text: "2020-01-01~",
      value: {
        type: "specific",
        operator: ">",
        values: [new Date(2020, 0, 1)],
        hasTime: false,
      },
    },
    {
      text: "2020-01-01T10:20:00~",
      value: {
        type: "specific",
        operator: ">",
        values: [new Date(2020, 0, 1, 10, 20)],
        hasTime: true,
      },
    },
  ])("should serialize and deserialize $text", ({ text, value }) => {
    expect(serializeDateFilter(value)).toEqual(text);
    expect(deserializeDateFilter(text)).toEqual(value);
  });
});
