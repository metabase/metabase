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

type FontGenericFamily = "serif" | "sans-serif" | "monospace";

type PredefinedFontName = Exclude<MetabaseFontFamily, "Custom">;

export const PREDEFINED_FONT_FAMILIES: Record<
  PredefinedFontName,
  FontGenericFamily
> = {
  Roboto: "sans-serif",
  Merriweather: "serif",
  "Open Sans": "sans-serif",
  Lato: "sans-serif",
  "Noto Sans": "sans-serif",
  "Roboto Slab": "serif",
  "Source Sans Pro": "sans-serif",
  Raleway: "sans-serif",
  "Slabo 27px": "serif",
  "PT Sans": "sans-serif",
  Poppins: "sans-serif",
  "PT Serif": "serif",
  "Roboto Mono": "monospace",
  "Roboto Condensed": "sans-serif",
  "Playfair Display": "serif",
  Oswald: "sans-serif",
  Ubuntu: "sans-serif",
  Montserrat: "sans-serif",
  Lora: "serif",
};

export function getFontFamilyValue(font: string): string {
  const generic =
    (PREDEFINED_FONT_FAMILIES as Record<string, FontGenericFamily | undefined>)[
      font
    ] ?? "sans-serif";
  return `"${font}", ${generic}`;
}
