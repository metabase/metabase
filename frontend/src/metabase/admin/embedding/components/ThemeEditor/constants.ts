import { t } from "ttag";

import type { MetabaseColor } from "metabase/embedding-sdk/theme";
import { ACCENT_COUNT } from "metabase/ui/colors/palette";
import { PREDEFINED_FONT_FAMILIES_FALLBACK_MAP } from "metabase/ui/fonts";

export const FONT_FAMILY_OPTIONS: { value: string; label: string }[] =
  Object.keys(PREDEFINED_FONT_FAMILIES_FALLBACK_MAP).map((name) => ({
    value: name,
    label: name,
  }));

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
  // https://linear.app/metabase/issue/EMB-1627/re-enable-secondary-background-and-use-it-in-sdk-dashboards
  // TODO Re-enable this once we actually use it in embedded dashboards and questions
  // { key: "background-secondary", label: () => t`Second. background` },
  { key: "filter", label: () => t`Filter` },
  { key: "summarize", label: () => t`Summarize` },
  { key: "positive", label: () => t`Positive` },
  { key: "negative", label: () => t`Negative` },
  { key: "shadow", label: () => t`Shadow` },
];

export const CHART_COLOR_COUNT = ACCENT_COUNT;
