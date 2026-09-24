import type { EmojiData, EmojiDataResolver } from "frimousse";

/**
 * The parts of an emojibase-data `data.json` entry the picker reads.
 * Skins with a numeric tone are skin tone variations. Skins with an array
 * tone are multi-person variations, listed as aliases.
 */
type EmojibaseEmoji = {
  emoji: string;
  label: string;
  version: number;
  group?: number;
  subgroup?: number;
  tags?: string[];
  skins?: { emoji: string; tone?: number | number[] }[];
};

type EmojibaseMessages = {
  groups: { key: string; message: string; order: number }[];
  subgroups: { key: string; message: string; order: number }[];
  skinTones: { key: string; message: string }[];
};

type EmojiSupport = {
  emojiVersion: number;
  countryFlags: boolean;
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

const PROBE_SIZE = 2;
const PROBE_FONT =
  "'Apple Color Emoji', 'Noto Color Emoji', 'Twemoji Mozilla', 'Android Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', EmojiSymbols, sans-serif";
const COUNTRY_FLAG_PROBE = "🇪🇺";

const capitalize = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);

/**
 * Converts the raw emojibase-data files into the shape frimousse renders.
 * Ported from frimousse's `defaultEmojiDataResolver`, which only reads
 * the files over HTTP.
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

/**
 * Draws an emoji twice in different fill colours at 2px. A colour emoji glyph
 * ignores the fill, so the pixels match. Text and tofu take the fill, so they
 * differ. A sequence the font cannot join renders as several glyphs and is
 * wider than the probe.
 */
function canRenderEmoji(emoji: string): boolean {
  let context: CanvasRenderingContext2D | null = null;
  try {
    context = document
      .createElement("canvas")
      .getContext("2d", { willReadFrequently: true });
  } catch {
    return false;
  }
  if (!context) {
    return false;
  }

  context.canvas.width = PROBE_SIZE;
  context.canvas.height = PROBE_SIZE;
  context.font = `${PROBE_SIZE}px ${PROBE_FONT}`;
  context.textBaseline = "middle";
  if (context.measureText(emoji).width >= PROBE_SIZE * 2) {
    return false;
  }

  context.fillStyle = "blue";
  context.fillText(emoji, 0, 0);
  const blue = context.getImageData(0, 0, PROBE_SIZE, PROBE_SIZE).data;
  context.clearRect(0, 0, PROBE_SIZE, PROBE_SIZE);
  context.fillStyle = "red";
  context.fillText(emoji, 0, 0);
  const red = context.getImageData(0, 0, PROBE_SIZE, PROBE_SIZE).data;

  for (let offset = 0; offset < PROBE_SIZE * PROBE_SIZE * 4; offset += 4) {
    if (
      blue[offset] !== red[offset] ||
      blue[offset + 1] !== red[offset + 1] ||
      blue[offset + 2] !== red[offset + 2]
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Finds the newest emoji version this browser can draw by probing one emoji
 * per version, newest first, and whether it draws country flags at all.
 * Windows has no flag glyphs, so it shows two letters instead.
 */
export function detectEmojiSupport(
  emojis: Emoji[],
  canRender: (emoji: string) => boolean = canRenderEmoji,
): EmojiSupport {
  const sampleByVersion = new Map<number, string>();
  for (const emoji of emojis) {
    if (!sampleByVersion.has(emoji.version)) {
      sampleByVersion.set(emoji.version, emoji.emoji);
    }
  }
  const samples = [...sampleByVersion.entries()].sort(
    ([versionA], [versionB]) => versionB - versionA,
  );
  const countryFlags = canRender(COUNTRY_FLAG_PROBE);

  for (const [version, sample] of samples) {
    if (canRender(sample)) {
      return { emojiVersion: version, countryFlags };
    }
  }
  return { emojiVersion: samples[0]?.[0] ?? 0, countryFlags };
}

export function filterSupportedEmojis(
  data: EmojiData,
  { emojiVersion, countryFlags }: EmojiSupport,
): EmojiData {
  return {
    ...data,
    emojis: data.emojis.filter((emoji) => {
      const supported = emoji.version <= emojiVersion;
      return emoji.countryFlag ? supported && countryFlags : supported;
    }),
  };
}

let detectedSupport: EmojiSupport | undefined;

/**
 * Serves the bundled English emojibase snapshot to frimousse. The two JSON
 * files load as one on-demand chunk the first time a picker opens.
 * frimousse memoizes the result per page, so the probe runs once.
 */
export const resolveEmojiData: EmojiDataResolver = async (
  _locale,
  { emojiVersion, signal },
) => {
  const [{ default: emojis }, { default: messages }] = await Promise.all([
    import(/* webpackChunkName: "emoji-data" */ "./emojibase/en/data.json"),
    import(/* webpackChunkName: "emoji-data" */ "./emojibase/en/messages.json"),
  ]);
  signal?.throwIfAborted();

  const data = toEmojiData(emojis, messages, "en");
  detectedSupport ??= detectEmojiSupport(data.emojis);

  return filterSupportedEmojis(data, {
    emojiVersion: emojiVersion ?? detectedSupport.emojiVersion,
    countryFlags: detectedSupport.countryFlags,
  });
};
