// Both locales use Latin digits and the same separators, so separator overrides
// remain independent of the grouping and compact-unit preset.
const NUMBER_FORMAT_LOCALES = {
  thousands: "en",
  "lakh-crore": "en-IN",
} as const;

export type NumberFormat = keyof typeof NUMBER_FORMAT_LOCALES;

export const DEFAULT_NUMBER_FORMAT: NumberFormat = "thousands";

export function getNumberFormatLocale(
  numberFormat: NumberFormat = DEFAULT_NUMBER_FORMAT,
) {
  return (
    NUMBER_FORMAT_LOCALES[numberFormat] ??
    NUMBER_FORMAT_LOCALES[DEFAULT_NUMBER_FORMAT]
  );
}
