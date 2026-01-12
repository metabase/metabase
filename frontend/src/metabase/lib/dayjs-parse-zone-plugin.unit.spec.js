import dayjs from "dayjs";

describe("parse zone", () => {
  it("holds the original offset instead of converting to local", () => {
    const dParseZone = dayjs.parseZone("2013-01-01T00:00:00-13:00");
    const dWithoutParseZone = dayjs.utc("2013-01-01T00:00:00-13:00");

    expect(dParseZone.format("Z")).toEqual("-13:00");
    expect(dWithoutParseZone.format("Z")).toEqual("+00:00");
  });

  it("handles positive and negative timezone", () => {
    const dNegative = dayjs.parseZone("2013-01-01T00:00:00-13:00");
    const dPositive = dayjs.parseZone("2013-01-01T00:00:00+13:00");

    expect(dPositive.format("YYYY-MM-DD HH:mm:ss Z")).toEqual(
      "2013-01-01 00:00:00 +13:00",
    );
    expect(dNegative.format("YYYY-MM-DD HH:mm:ss Z")).toEqual(
      "2013-01-01 00:00:00 -13:00",
    );
  });

  it("works with custom format plugin", () => {
    const d = dayjs.parseZone(
      "2013 01 01 00:00:00 -13:00",
      "YYYY MM DD HH:mm:ss",
    );
    expect(d.format("YYYY-MM-DD HH:mm:ss")).toEqual("2013-01-01 00:00:00");
  });

  it("uses default constructor when no date string is provided", () => {
    const d = dayjs.parseZone(new Date(2013, 0, 1, 0, 0, 0));
    expect(d.format("YYYY-MM-DD HH:mm:ss")).toEqual("2013-01-01 00:00:00");
  });

  it("keeps the time and change the zone to 0 when no timezone is provided", () => {
    const d = dayjs.parseZone("2013-01-01T00:00:00");
    expect(d.format("YYYY-MM-DD HH:mm:ss")).toEqual("2013-01-01 00:00:00");
  });

  it("handles UTC format", () => {
    const d = dayjs.parseZone("2013-01-01T00:00:00Z");
    expect(d.format("YYYY-MM-DD HH:mm:ss")).toEqual(
      dayjs.utc("2013-01-01T00:00:00").format("YYYY-MM-DD HH:mm:ss"),
    );
  });

  // related issue https://github.com/iamkun/dayjs/issues/2459
  it.failing("add pads to the not complete date", () => {
    const d = dayjs.parseZone("2025-03-11T20:45:17.01");
    expect(d.format("MMMM DD, YYYY, h:mm:ss.SSS A")).toEqual(
      dayjs("March 11, 2025, 8:45:17.010 PM").format(
        "MMMM DD, YYYY, h:mm:ss.SSS A",
      ),
    );
  });
});
