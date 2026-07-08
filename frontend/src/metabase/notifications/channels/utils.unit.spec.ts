import {
  findChannelId,
  getDisplayNames,
} from "metabase/notifications/channels/utils";
import type { SlackChannelOption } from "metabase-types/api";

describe("getDisplayNames", () => {
  it("extracts display names from enriched options", () => {
    const options: SlackChannelOption[] = [
      { displayName: "#general", id: "C001" },
      { displayName: "#random", id: "C002" },
      { displayName: "@user1", id: "U001" },
    ];
    expect(getDisplayNames(options)).toEqual(["#general", "#random", "@user1"]);
  });

  it("returns empty array for empty input", () => {
    expect(getDisplayNames([])).toEqual([]);
  });
});

describe("findChannelId", () => {
  const options: SlackChannelOption[] = [
    { displayName: "#general", id: "C001" },
    { displayName: "#random", id: "C002" },
    { displayName: "@user1", id: "U001" },
  ];

  it("returns the ID for a known channel name", () => {
    expect(findChannelId(options, "#random")).toBe("C002");
  });

  it("returns undefined for an unknown channel name", () => {
    expect(findChannelId(options, "#nonexistent")).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(findChannelId(options, "")).toBeUndefined();
  });

  it("returns undefined for empty options", () => {
    expect(findChannelId([], "#general")).toBeUndefined();
  });
});
