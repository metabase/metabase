const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

/** English name of a two-letter country code, or null when it is unknown. */
export function getCountryName(value: string): string | null {
  if (!/^[a-z]{2}$/i.test(value)) {
    return null;
  }
  const code = value.toUpperCase();
  try {
    const name = regionNames.of(code);
    return name != null && name !== code ? name : null;
  } catch {
    return null;
  }
}
