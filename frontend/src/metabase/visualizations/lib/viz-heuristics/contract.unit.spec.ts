import { FIXTURE_INPUTS } from "./__fixtures__/inputs";
import { getContractViolations } from "./contract";
import { VIZ_HEURISTICS } from "./registry";

describe("viz heuristic contract", () => {
  const fixtures = Object.entries(FIXTURE_INPUTS);

  it("has at least one registered heuristic and one fixture", () => {
    expect(VIZ_HEURISTICS.length).toBeGreaterThan(0);
    expect(fixtures.length).toBeGreaterThan(0);
  });

  describe.each(VIZ_HEURISTICS.map((heuristic) => [heuristic.id, heuristic]))(
    "%s",
    (_id, heuristic) => {
      it.each(fixtures)("holds for the %s fixture", (_name, input) => {
        expect(getContractViolations(heuristic, [input])).toEqual([]);
      });

      it("holds for every fixture at once", () => {
        expect(
          getContractViolations(
            heuristic,
            fixtures.map(([, input]) => input),
          ),
        ).toEqual([]);
      });
    },
  );

  it("reports a heuristic that throws, ignores allowed, or misses the 1×1 rule", () => {
    const violations = getContractViolations(
      {
        id: "broken",
        label: "Broken",
        description: "",
        resolve: (input) => {
          if (input.context === "lens") {
            throw new Error("boom");
          }
          return { display: "line" };
        },
      },
      [
        FIXTURE_INPUTS["lens hint"],
        FIXTURE_INPUTS["allowed restriction"],
        FIXTURE_INPUTS["1×1 count"],
      ],
    );

    expect(violations).toEqual([
      "[broken] input 0 (lens): threw Error: boom",
      "[broken] input 1 (metric-grid): display line not in allowed",
      "[broken] input 2 (harness): 1×1 result resolved to line, not scalar",
    ]);
  });

  it("reports a non-deterministic heuristic", () => {
    let calls = 0;
    const violations = getContractViolations(
      {
        id: "flaky",
        label: "Flaky",
        description: "",
        resolve: () => ({ display: calls++ % 2 === 0 ? "bar" : "line" }),
      },
      [FIXTURE_INPUTS["time series"]],
    );

    expect(violations).toEqual([
      "[flaky] input 0 (harness): not deterministic",
    ]);
  });
});
