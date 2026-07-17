const validTabArray = ["db", "csv", "gsheets"] as const;
const validTabs = new Set<string>(validTabArray);

export type AddDataTab = (typeof validTabArray)[number];

export const isValidTab = (v: string | null): v is AddDataTab =>
  typeof v === "string" && validTabs.has(v);
