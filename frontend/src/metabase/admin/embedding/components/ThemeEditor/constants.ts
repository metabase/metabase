import { t } from "ttag";

import type { MetabaseColor } from "metabase/embedding-sdk/theme";
import { ACCENT_COUNT } from "metabase/ui/colors/palette";

export const FONT_FAMILY_OPTIONS: { value: string; label: string }[] = [
  { value: "Roboto", label: "Roboto" },
  { value: "Merriweather", label: "Merriweather" },
  { value: "Open Sans", label: "Open Sans" },
  { value: "Lato", label: "Lato" },
  { value: "Noto Sans", label: "Noto Sans" },
  { value: "Roboto Slab", label: "Roboto Slab" },
  { value: "Source Sans Pro", label: "Source Sans Pro" },
  { value: "Raleway", label: "Raleway" },
  { value: "Slabo 27px", label: "Slabo 27px" },
  { value: "PT Sans", label: "PT Sans" },
  { value: "Poppins", label: "Poppins" },
  { value: "PT Serif", label: "PT Serif" },
  { value: "Roboto Mono", label: "Roboto Mono" },
  { value: "Roboto Condensed", label: "Roboto Condensed" },
  { value: "Playfair Display", label: "Playfair Display" },
  { value: "Oswald", label: "Oswald" },
  { value: "Ubuntu", label: "Ubuntu" },
  { value: "Montserrat", label: "Montserrat" },
  { value: "Lora", label: "Lora" },
];

export const PRIMARY_COLORS: {
  key: Exclude<MetabaseColor, "charts">;
  label: () => string;
}[] = [
  { key: "brand", label: () => t`Brand` },
  { key: "background", label: () => t`Background` },
  { key: "text-primary", label: () => t`Primary text` },
];

export const MORE_COLORS: {
  key: Exclude<MetabaseColor, "charts">;
  label: () => string;
}[] = [
  { key: "text-secondary", label: () => t`Secondary text` },
  { key: "text-tertiary", label: () => t`Tertiary text` },
  { key: "border", label: () => t`Border` },
  { key: "background-secondary", label: () => t`Second. background` },
  { key: "filter", label: () => t`Filter` },
  { key: "summarize", label: () => t`Summarize` },
  { key: "positive", label: () => t`Positive` },
  { key: "negative", label: () => t`Negative` },
  { key: "shadow", label: () => t`Shadow` },
];

export const CHART_COLOR_COUNT = ACCENT_COUNT;
