const validTabArray = ["db", "csv", "gsheet"] as const;
const validTabs = new Set<string>(validTabArray);

type AddDataTab = (typeof validTabArray)[number];

export const isValidTab = (v: string | null): v is AddDataTab =>
  typeof v === "string" && validTabs.has(v);
