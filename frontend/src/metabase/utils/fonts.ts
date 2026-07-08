export type MetabaseFontFamily =
  | "Roboto"
  | "Merriweather"
  | "Open Sans"
  | "Lato"
  | "Inter"
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

// NOTE: This map is NOT the source of truth for the fonts Metabase ships.
// The canonical list is computed by `src/metabase/util/fonts.clj`, which
// scans `resources/frontend_client/app/fonts/` at runtime and exposes the
// result via the `available-fonts` setting — that's what populates the
// main admin appearance dropdown.
//
// This map is consumed by the embedding ThemeEditor (its dropdown and the
// `MetabaseFontFamily` union above) and by `getFontFamilyValue` to pick a
// per-font CSS fallback chain on a best-effort basis for cases when selected
// font may lack some glyphs.
//
// When adding or removing a directory under `resources/frontend_client/app/fonts/`,
// please keep this map and `MetabaseFontFamily` in sync.
export const PREDEFINED_FONT_FAMILIES_FALLBACK_MAP: Record<
  PredefinedFontName,
  string
> = {
  Roboto: '"Noto Sans", sans-serif',
  Merriweather: '"Lora", serif',
  "Open Sans": '"Lato", sans-serif',
  Lato: "Arial, sans-serif",
  Inter: "sans-serif",
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

function isPredefinedFontName(font: string): font is PredefinedFontName {
  return font in PREDEFINED_FONT_FAMILIES_FALLBACK_MAP;
}

export function getFontFamilyValue(font: string): string {
  const fallback = isPredefinedFontName(font)
    ? PREDEFINED_FONT_FAMILIES_FALLBACK_MAP[font]
    : "sans-serif";
  return `"${font}", ${fallback}`;
}
