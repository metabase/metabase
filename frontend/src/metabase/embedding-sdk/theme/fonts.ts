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

export function getFontFamilyValue(font: string): string {
  return (font ?? "")
    .split(",")
    .map((name) => name.replaceAll(/["']/g, "").trim())
    .filter(Boolean)
    .map((name) => JSON.stringify(name))
    .join(", ");
}
