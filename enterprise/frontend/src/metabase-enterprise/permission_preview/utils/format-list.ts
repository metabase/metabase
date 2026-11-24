/** "A", "A and B", "A, B and C": the way the design spec writes lists. */
export function formatList(names: string[]) {
  // en-GB for its list style, which has no comma before "and"
  return new Intl.ListFormat("en-GB", {
    style: "long",
    type: "conjunction",
  }).format(names);
}
