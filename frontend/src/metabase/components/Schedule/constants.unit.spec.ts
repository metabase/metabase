import _ from "underscore";

import { has24HourModeSetting } from "metabase/lib/time";

import { getHours } from "./constants";

jest.mock("metabase/lib/time", () => ({
  has24HourModeSetting: jest.fn(),
}));

describe("getHours", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  const setup = ({ isClock24Hour }: { isClock24Hour: boolean }) => {
    (has24HourModeSetting as jest.Mock).mockReturnValue(isClock24Hour);
  };
  it("should return hours for a 24-hour clock when has24HourModeSetting returns true", () => {
    setup({ isClock24Hour: true });
    const result = getHours();
    expect(result).toHaveLength(24);

    const labels = result.map(hour => hour.label);
    const values = result.map(hour => hour.value);

    // prettier-ignore
    expect(labels).toEqual(["0:00", "1:00", "2:00", "3:00", "4:00", "5:00", "6:00", "7:00", "8:00", "9:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00", "22:00", "23:00"])
    // prettier-ignore
    expect(values).toEqual(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23"]);
  });

  it("should return hours for a 12-hour clock when has24HourModeSetting returns false", () => {
    setup({ isClock24Hour: false });

    const result = getHours();
    expect(result).toHaveLength(12);

    const labels = result.map(hour => hour.label);
    const values = result.map(hour => hour.value);

    // prettier-ignore
    expect(labels).toEqual(["12:00", "1:00", "2:00", "3:00", "4:00", "5:00", "6:00", "7:00", "8:00", "9:00", "10:00", "11:00"])
    // prettier-ignore
    expect(values).toEqual(["12", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"]);
  });
});
