import {
  detectEmojiSupport,
  filterSupportedEmojis,
  resolveEmojiData,
  toEmojiData,
} from "./emoji-data";

const messages = {
  groups: [
    { key: "smileys-emotion", message: "smileys & emotion", order: 0 },
    { key: "component", message: "component", order: 2 },
    { key: "flags", message: "flags", order: 9 },
  ],
  subgroups: [
    { key: "face-smiling", message: "smiling", order: 0 },
    { key: "country-flag", message: "country flags", order: 98 },
    { key: "subdivision-flag", message: "subdivision flags", order: 99 },
  ],
  skinTones: [
    { key: "light", message: "light skin tone" },
    { key: "dark", message: "dark skin tone" },
  ],
};

const emojis = [
  {
    emoji: "👋",
    label: "waving hand",
    version: 0.6,
    group: 0,
    subgroup: 0,
    tags: ["hello"],
    skins: [
      { emoji: "👋🏻", tone: 1 },
      { emoji: "👋🏿", tone: 5 },
      { emoji: "🧑🏻‍🤝‍🧑🏿", tone: [1, 5] },
    ],
  },
  {
    emoji: "🇪🇺",
    label: "flag: European Union",
    version: 2,
    group: 9,
    subgroup: 98,
  },
  { emoji: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", label: "flag: England", version: 5, group: 9, subgroup: 99 },
  {
    emoji: "🫩",
    label: "face with bags under eyes",
    version: 16,
    group: 0,
    subgroup: 0,
  },
  { emoji: "🏻", label: "light skin tone", version: 1 },
];

describe("toEmojiData", () => {
  const data = toEmojiData(emojis, messages, "en");

  it("drops the component group and capitalizes labels", () => {
    expect(data.categories).toEqual([
      { index: 0, label: "Smileys & emotion" },
      { index: 9, label: "Flags" },
    ]);
    expect(data.skinTones).toEqual({
      light: "Light skin tone",
      dark: "Dark skin tone",
    });
  });

  it("keeps only emojis that belong to a group", () => {
    expect(data.emojis.map((emoji) => emoji.emoji)).toEqual([
      "👋",
      "🇪🇺",
      "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
      "🫩",
    ]);
  });

  it("splits skins into tone variations and multi-person aliases", () => {
    expect(data.emojis[0]).toEqual({
      emoji: "👋",
      category: 0,
      version: 0.6,
      label: "Waving hand",
      tags: ["hello"],
      countryFlag: undefined,
      skins: { light: "👋🏻", dark: "👋🏿" },
      aliases: ["🧑🏻‍🤝‍🧑🏿"],
    });
  });

  it("marks country flags but not subdivision flags", () => {
    expect(data.emojis[1].countryFlag).toBe(true);
    expect(data.emojis[2].countryFlag).toBeUndefined();
  });
});

describe("detectEmojiSupport", () => {
  const data = toEmojiData(emojis, messages, "en");

  it("returns the newest version the browser can draw", () => {
    const canRender = (emoji: string) => emoji !== "🫩";
    expect(detectEmojiSupport(data.emojis, canRender)).toEqual({
      emojiVersion: 5,
      countryFlags: true,
    });
  });

  it("falls back to the newest version when nothing can be probed", () => {
    expect(detectEmojiSupport(data.emojis, () => false)).toEqual({
      emojiVersion: 16,
      countryFlags: false,
    });
  });
});

describe("filterSupportedEmojis", () => {
  const data = toEmojiData(emojis, messages, "en");

  it("removes newer emojis and, without flag support, country flags", () => {
    const filtered = filterSupportedEmojis(data, {
      emojiVersion: 5,
      countryFlags: false,
    });
    expect(filtered.emojis.map((emoji) => emoji.emoji)).toEqual(["👋", "🏴󠁧󠁢󠁥󠁮󠁧󠁿"]);
  });
});

describe("resolveEmojiData", () => {
  it("serves the bundled snapshot", async () => {
    jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);

    const data = await resolveEmojiData("en", {});

    expect(data.locale).toBe("en");
    expect(data.categories.length).toBeGreaterThan(5);
    expect(data.emojis.length).toBeGreaterThan(1500);
    expect(data.emojis.some((emoji) => emoji.emoji === "👋")).toBe(true);
    expect(data.emojis.some((emoji) => emoji.countryFlag)).toBe(false);
  });
});
