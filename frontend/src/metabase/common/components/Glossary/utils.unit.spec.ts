import type { GlossaryItem } from "metabase-types/api";

import { getNextSort, getVisibleItems, isDuplicateTerm } from "./utils";

const ARR: GlossaryItem = {
  id: 1,
  term: "ARR",
  definition: "Annual recurring revenue",
};
const CHURN: GlossaryItem = {
  id: 2,
  term: "Churn",
  definition: "Customers who cancel",
};
const MRR: GlossaryItem = {
  id: 3,
  term: "MRR",
  definition: "Monthly recurring revenue",
};
const GLOSSARY = [CHURN, MRR, ARR];

describe("getVisibleItems", () => {
  it("keeps the server order without a search or a sort", () => {
    expect(getVisibleItems(GLOSSARY, "", null)).toEqual([CHURN, MRR, ARR]);
  });

  it("filters by term or definition, case-insensitively", () => {
    expect(getVisibleItems(GLOSSARY, "RECURRING", null)).toEqual([MRR, ARR]);
    expect(getVisibleItems(GLOSSARY, "churn", null)).toEqual([CHURN]);
    expect(getVisibleItems(GLOSSARY, "cohort", null)).toEqual([]);
  });

  it("orders numbers inside terms by value, not digit by digit", () => {
    const tiers = [
      { id: 4, term: "Tier 10", definition: "Largest accounts" },
      { id: 5, term: "Tier 2", definition: "Mid-size accounts" },
      { id: 6, term: "Tier 1", definition: "Smallest accounts" },
    ];

    expect(
      getVisibleItems(tiers, "", { column: "term", direction: "asc" }).map(
        (item) => item.term,
      ),
    ).toEqual(["Tier 1", "Tier 2", "Tier 10"]);
  });

  it("sorts the filtered items by the chosen column", () => {
    expect(
      getVisibleItems(GLOSSARY, "recurring", {
        column: "term",
        direction: "asc",
      }),
    ).toEqual([ARR, MRR]);
    expect(
      getVisibleItems(GLOSSARY, "", {
        column: "definition",
        direction: "desc",
      }),
    ).toEqual([MRR, CHURN, ARR]);
  });
});

describe("getNextSort", () => {
  it("cycles ascending, descending, then back to the server order", () => {
    const ascending = getNextSort(null, "term");
    expect(ascending).toEqual({ column: "term", direction: "asc" });

    const descending = getNextSort(ascending, "term");
    expect(descending).toEqual({ column: "term", direction: "desc" });

    expect(getNextSort(descending, "term")).toBeNull();
  });

  it("starts ascending again on another column", () => {
    const descending = getNextSort(getNextSort(null, "term"), "term");

    expect(getNextSort(descending, "definition")).toEqual({
      column: "definition",
      direction: "asc",
    });
  });
});

describe("isDuplicateTerm", () => {
  it("matches existing terms ignoring case and surrounding spaces", () => {
    expect(isDuplicateTerm(GLOSSARY, "arr")).toBe(true);
    expect(isDuplicateTerm(GLOSSARY, "  Churn  ")).toBe(true);
    expect(isDuplicateTerm(GLOSSARY, "ARPU")).toBe(false);
  });

  it("ignores a blank term and the entry's own term", () => {
    expect(isDuplicateTerm(GLOSSARY, "   ")).toBe(false);
    expect(isDuplicateTerm(GLOSSARY, "ARR", ARR.id)).toBe(false);
    expect(isDuplicateTerm(GLOSSARY, "ARR", CHURN.id)).toBe(true);
  });
});
