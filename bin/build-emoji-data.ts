/**
 * Regenerates the emoji picker's catalogue from a pinned emojibase-data
 * release. Run with `bun run build-emoji-data` and commit the result.
 */
import { writeFile } from "node:fs/promises";

import {
  type EmojibaseEmoji,
  type EmojibaseMessages,
  toEmojiData,
} from "../frontend/src/metabase/common/components/EmojiPicker/emojibase/transform";

const EMOJIBASE_DATA_VERSION = "16.0.3";
const LOCALE = "en";
const OUTPUT = `frontend/src/metabase/common/components/EmojiPicker/emojibase/${LOCALE}.json`;

const fetchJson = async <T>(file: string): Promise<T> => {
  const url = `https://cdn.jsdelivr.net/npm/emojibase-data@${EMOJIBASE_DATA_VERSION}/${LOCALE}/${file}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} for ${url}`);
  }
  return response.json();
};

const [emojis, messages] = await Promise.all([
  fetchJson<EmojibaseEmoji[]>("data.json"),
  fetchJson<EmojibaseMessages>("messages.json"),
]);

const data = toEmojiData(emojis, messages, LOCALE);
await writeFile(OUTPUT, JSON.stringify(data, null, 2) + "\n");
// eslint-disable-next-line no-console -- a build script reports to the terminal
console.log(
  `${OUTPUT}: ${data.emojis.length} emojis in ${data.categories.length} categories`,
);
