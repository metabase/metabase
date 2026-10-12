import { decodeSettings, encodeSettings } from "./url-state";

describe("url state", () => {
  it("round-trips stored settings", () => {
    const stored = {
      "funnel.steps": [{ type: "saved", id: "trial" }],
      date_range: "past30days",
    };

    expect(decodeSettings(encodeSettings(stored))).toEqual(stored);
  });

  it("encodes empty settings as an empty hash", () => {
    expect(encodeSettings({})).toBe("");
    expect(decodeSettings("")).toEqual({});
  });

  it("ignores a malformed hash", () => {
    expect(decodeSettings("not base64 json")).toEqual({});
    expect(decodeSettings(encodeSettings([1, 2]))).toEqual({});
  });
});
