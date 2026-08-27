import { getCandidatePillAriaLabel } from "./CandidatePills";

describe("getCandidatePillAriaLabel", () => {
  it.each([
    ["boolean", "Is active", "Boolean predicate: Is active"],
    ["category", "Plan is Pro", "Category predicate: Plan is Pro"],
    [
      "number",
      "Total is greater than 10",
      "Number predicate: Total is greater than 10",
    ],
    ["temporal", "Created this month", "Time predicate: Created this month"],
    ["other", "Has coordinates", "Predicate: Has coordinates"],
  ] as const)(
    "describes a %s predicate as a complete phrase",
    (kind, label, expected) => {
      expect(getCandidatePillAriaLabel(kind, label)).toBe(expected);
    },
  );
});
