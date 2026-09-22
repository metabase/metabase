import {
  CHUNKS,
  DEFAULT_SPEC_PATTERN,
  buildMatrix,
  narrowSpecs,
  planE2e,
} from "./e2e";

const SPECS = [
  "e2e/test/scenarios/onboarding/command-palette.cy.spec.js",
  "e2e/test/scenarios/question/document-title.cy.spec.js",
];

// A spec change matches e2e_specs and, through it, e2e_all.
const specsOnly = { e2e_all: SPECS, e2e_specs: SPECS };

const RUNNER = "ubuntu-22.04";

const build = (specs: string, chunks = CHUNKS) =>
  buildMatrix({ specs, runner: RUNNER, chunks });

const groupNames = (include: { name: string }[]) => include.map((it) => it.name);

describe("narrowSpecs", () => {
  it("runs every spec when the diff reached past the specs", () => {
    const specs = narrowSpecs({
      pullRequest: true,
      files: {
        e2e_all: [...SPECS, "src/metabase/api/card.clj"],
        e2e_specs: SPECS,
      },
    });

    expect(specs).toBe("");
  });

  it("narrows to the changed specs when a pull request changed nothing else", () => {
    expect(narrowSpecs({ pullRequest: true, files: specsOnly })).toBe(
      SPECS.join(","),
    );
  });

  // A force-run reports every filter as matched, so the two lists agreeing proves nothing.
  it("runs every spec on a force-run", () => {
    expect(
      narrowSpecs({ forceRun: true, pullRequest: true, files: specsOnly }),
    ).toBe("");
  });

  it("runs every spec on a push, whatever the diff touched", () => {
    expect(narrowSpecs({ files: specsOnly })).toBe("");
  });

  it("runs every spec when the gate reported no files at all", () => {
    expect(narrowSpecs({ pullRequest: true })).toBe("");
  });

  // Order comes from the paths filter, so two lists of the same specs in a different order are not
  // the same change and the suite stays wide rather than guessing.
  it("runs every spec when the two file lists disagree on order", () => {
    const specs = narrowSpecs({
      pullRequest: true,
      files: { e2e_all: SPECS, e2e_specs: [...SPECS].reverse() },
    });

    expect(specs).toBe("");
  });
});

describe("buildMatrix", () => {
  describe("over the whole spec tree", () => {
    it.each(["", DEFAULT_SPEC_PATTERN])(
      "reserves three chunks for the tag groups, given %p",
      (specs) => {
        const { include, regularChunks } = build(specs, 30);

        expect(regularChunks).toBe(27);
        expect(include).toHaveLength(30);
      },
    );

    it("names the regular groups in sequence", () => {
      const { include } = build("", 10);
      const regular = include.filter((leg) => leg.name.startsWith("e2e-group-"));

      expect(groupNames(regular)).toEqual([
        "e2e-group-01",
        "e2e-group-02",
        "e2e-group-03",
        "e2e-group-04",
        "e2e-group-05",
        "e2e-group-06",
        "e2e-group-07",
      ]);
    });

    it("puts the tag groups last", () => {
      const { include } = build("", CHUNKS);

      expect(groupNames(include).slice(-3)).toEqual([
        "oss-subset",
        "mongo",
        "python",
      ]);
    });

    it("leaves only the tag groups when there are no chunks to spare", () => {
      const { include, regularChunks } = build("", 3);

      expect(regularChunks).toBe(0);
      expect(groupNames(include)).toEqual(["oss-subset", "mongo", "python"]);
    });

    // The regular groups take their slice by index, so naming specs would give them all the same.
    it("leaves the regular groups without a spec list", () => {
      const { include } = build("", 10);

      expect(include[0].specs).toBeUndefined();
    });

    it("runs the OSS subset as OSS and everything else as EE", () => {
      const { include } = build("", 10);
      const oss = include.filter((leg) => leg.edition === "oss");

      expect(groupNames(oss)).toEqual(["oss-subset"]);
    });
  });

  describe("over a narrowed spec list", () => {
    const twelve = Array.from(
      { length: 12 },
      (_, index) => `spec-${index}.cy.spec.js`,
    ).join(",");

    it("takes one chunk per five specs", () => {
      const { include, regularChunks } = build(twelve, 10);

      expect(regularChunks).toBe(3);
      expect(include.map((leg) => leg.specs?.split(",").length)).toEqual([
        5, 5, 2,
      ]);
    });

    it("gives every spec to exactly one chunk", () => {
      const { include } = build(twelve, 10);
      const spread = include.flatMap((leg) => leg.specs?.split(",") ?? []);

      expect(spread).toEqual(twelve.split(","));
    });

    // They select by tag over the whole tree, which is not what a narrowed run is.
    it("drops the tag groups", () => {
      const { include } = build("test1.cy.spec.js,test2.cy.spec.js", 50);

      expect(groupNames(include)).toEqual(["e2e-group-01"]);
    });

    it("always takes at least one chunk", () => {
      expect(build("one.cy.spec.js", 50).regularChunks).toBe(1);
    });
  });

  it("puts every leg on the runner it was given", () => {
    const { include } = build("", 10);

    include.forEach((leg) => expect(leg.runner).toBe(RUNNER));
  });
});

describe("planE2e", () => {
  it("plans nothing when the gate says the suite should not run", () => {
    expect(planE2e({ run: false })["e2e-tests"]).toBeNull();
  });

  it("plans the full matrix on an ordinary run", () => {
    const plan = planE2e({ run: true, runner: RUNNER });

    expect(plan["e2e-tests"]?.include).toHaveLength(CHUNKS);
    expect(plan["total-chunks"]).toBe(CHUNKS - 3);
  });

  it("plans only the changed specs when a pull request narrowed them", () => {
    const plan = planE2e({
      run: true,
      pullRequest: true,
      files: specsOnly,
      runner: RUNNER,
    });

    expect(groupNames(plan["e2e-tests"]?.include ?? [])).toEqual([
      "e2e-group-01",
    ]);
    expect(plan["total-chunks"]).toBe(1);
  });
});
