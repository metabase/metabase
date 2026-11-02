import type { EmojiData } from "frimousse";

/**
 * The parts of an emojibase-data `data.json` entry the picker reads.
 * Skins with a numeric tone are skin tone variations. Skins with an array
 * tone are multi-person variations, listed as aliases.
 */
export type EmojibaseEmoji = {
  emoji: string;
  label: string;
  version: number;
  group?: number;
  subgroup?: number;
  tags?: string[];
  skins?: { emoji: string; tone?: number | number[] }[];
};

export type EmojibaseMessages = {
  groups: { key: string; message: string; order: number }[];
  subgroups: { key: string; message: string; order: number }[];
  skinTones: { key: string; message: string }[];
};

type Emoji = EmojiData["emojis"][number];

// Indexed by the emojibase `tone` number.
const SKIN_TONES = [
  "none",
  "light",
  "medium-light",
  "medium",
  "medium-dark",
  "dark",
] as const;

const capitalize = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);

/**
 * Converts the raw emojibase-data files into the shape frimousse renders.
 * Ported from frimousse's `defaultEmojiDataResolver`, which only reads the
 * files over HTTP. Runs in `bin/build-emoji-data.ts`, not in the browser.
 */
export function toEmojiData(
  emojis: EmojibaseEmoji[],
  messages: EmojibaseMessages,
  locale: string,
): EmojiData {
  const flagSubgroup = messages.subgroups.find(
    (subgroup) =>
      subgroup.key === "country-flag" || subgroup.key === "subdivision-flag",
  );
  const categories = messages.groups
    .filter((group) => group.key !== "component")
    .map((group) => ({ index: group.order, label: capitalize(group.message) }));
  // emojibase's messages list exactly the five skin tones frimousse types.
  const skinTones = Object.fromEntries(
    messages.skinTones.map((tone) => [tone.key, capitalize(tone.message)]),
  ) as EmojiData["skinTones"];

  return {
    locale,
    categories,
    skinTones,
    emojis: emojis
      .filter(
        (emoji): emoji is EmojibaseEmoji & { group: number } =>
          emoji.group !== undefined,
      )
      .map((emoji) => {
        const aliases = emoji.skins
          ?.filter((skin) => Array.isArray(skin.tone))
          .map((skin) => skin.emoji);

        return {
          emoji: emoji.emoji,
          category: emoji.group,
          version: emoji.version,
          label: capitalize(emoji.label),
          tags: emoji.tags ?? [],
          countryFlag:
            flagSubgroup && emoji.subgroup === flagSubgroup.order
              ? true
              : undefined,
          skins: toSkins(emoji.skins),
          aliases: aliases?.length ? aliases : undefined,
        };
      }),
  };
}

function toSkins(skins: EmojibaseEmoji["skins"]): Emoji["skins"] {
  if (!skins) {
    return undefined;
  }
  const byTone: Partial<Record<(typeof SKIN_TONES)[number], string>> = {};
  for (const skin of skins) {
    if (typeof skin.tone === "number") {
      byTone[SKIN_TONES[skin.tone]] = skin.emoji;
    }
  }
  // Every emoji that has skins lists all five tones.
  return byTone as Emoji["skins"];
}
