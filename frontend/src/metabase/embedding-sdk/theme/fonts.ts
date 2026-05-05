export type MetabaseFontFamily =
  | "Roboto"
  | "Merriweather"
  | "Open Sans"
  | "Lato"
  | "Noto Sans"
  | "Roboto Slab"
  | "Source Sans Pro"
  | "Raleway"
  | "Slabo 27px"
  | "PT Sans"
  | "Poppins"
  | "PT Serif"
  | "Roboto Mono"
  | "Roboto Condensed"
  | "Playfair Display"
  | "Oswald"
  | "Ubuntu"
  | "Montserrat"
  | "Lora"
  | "Custom";

type PredefinedFontName = Exclude<MetabaseFontFamily, "Custom">;

// For cases when selected font doesn't support certain glyph (e.g. Lato doesn't support some parts of extended
// Latin alphabet, Poppins doesn't support cyrillic), browser will use fallback font to render it.
// So we set a per-font fallback which matches original font's style as much as possible, so glyphs
// rendered with fallback don't look too out of place on a page.
export const PREDEFINED_FONT_FAMILIES_FALLBACK_MAP: Record<
  PredefinedFontName,
  string
> = {
  Roboto: '"Noto Sans", sans-serif',
  Merriweather: '"Lora", serif',
  "Open Sans": '"Lato", sans-serif',
  Lato: "sans-serif",
  "Noto Sans": "sans-serif",
  "Roboto Slab": "serif",
  "Source Sans Pro": '"Lato", sans-serif',
  Raleway: '"Montserrat", sans-serif',
  "Slabo 27px": '"Roboto Slab", serif',
  "PT Sans": '"Lato", sans-serif',
  Poppins: '"Montserrat", sans-serif',
  "PT Serif": '"Lora", serif',
  "Roboto Mono": "monospace",
  "Roboto Condensed": "sans-serif",
  "Playfair Display": "serif",
  Oswald: '"Roboto Condensed", sans-serif',
  Ubuntu: '"Lato", sans-serif',
  Montserrat: "sans-serif",
  Lora: "serif",
};

export function getFontFamilyValue(font: string): string {
  const fallback =
    (
      PREDEFINED_FONT_FAMILIES_FALLBACK_MAP as Record<
        string,
        string | undefined
      >
    )[font] ?? "sans-serif";
  return `"${font}", ${fallback}`;
}
