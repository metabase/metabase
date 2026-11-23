import { utf8_to_b64url } from "metabase/utils/encoding";

import { decodeSettings, encodeSettings } from "./url-state";

describe("url state", () => {
  it("round-trips stored settings", () => {
    const stored = { date_range: "past30days", granularity: "week" };

    expect(decodeSettings(encodeSettings(stored))).toEqual(stored);
  });

  it("round-trips non-ASCII text", () => {
    const stored = { title: "Événements · 事件" };

    expect(decodeSettings(encodeSettings(stored))).toEqual(stored);
  });

  it("encodes empty settings as a non-empty hash", () => {
    expect(encodeSettings({})).not.toBe("");
    expect(decodeSettings(encodeSettings({}))).toEqual({});
    expect(decodeSettings("")).toEqual({});
  });

  it("ignores a malformed hash", () => {
    expect(decodeSettings("not base64 json")).toEqual({});
    expect(decodeSettings(encodeSettings([1, 2]))).toEqual({});
    expect(decodeSettings(utf8_to_b64url("null"))).toEqual({});
  });
});
