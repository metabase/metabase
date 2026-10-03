import { toEmojiData } from "./transform";

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
