import EMOJI from "./emoji.json"

export const emoji = {};
export const categories = EMOJI.categories;

for (let shortcode in EMOJI.emoji) {
    emoji[shortcode] = EMOJI.emoji[shortcode];
    emoji[shortcode].str = emoji[shortcode].react = String.fromCodePoint(emoji[shortcode].codepoint);
}
