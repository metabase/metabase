import EMOJI from "./emoji.json"

export const emoji = {};
export const categories = EMOJI.categories;

for (let shortcode in EMOJI.emoji) {
    let e = EMOJI.emoji[shortcode];
    emoji[shortcode] = {
        codepoint:  e,
        str:        String.fromCodePoint(e),
        react:      String.fromCodePoint(e)
    };
}
