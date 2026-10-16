import { describe, expect, it } from "bun:test";

import { type TestTriage, triageSource } from "./triage.ts";

// The pilot spec before its migration, with the verdicts of the manual pilot.
const PILOT_REF = "1a2df8db55f";
const PILOT_SPEC = "e2e/test/scenarios/admin/settings.cy.spec.js";

const source = Bun.spawnSync(["git", "show", `${PILOT_REF}:${PILOT_SPEC}`], {
  cwd: import.meta.dir,
}).stdout.toString();

const tests = triageSource({ source, specPath: PILOT_SPEC });

const find = (fragment: string): TestTriage[] =>
  tests.filter((t) => t.title.includes(fragment));

const MOVE = [
  "should prompt admin to migrate to a hosted instance",
  "`MB_SITE_URL` environment variable (metabase#14900)",
  "should show the store link when running Metabase OSS",
  "should hide the store link when running Metabase EE",
  "should be visible when running Metabase Cloud",
  "should prompt us to migrate to cloud if we are not hosted",
  "should not allow custom SMTP configuration",
  "link to the store for an unlincensed enterprise instance",
  "should show the updates page",
  "should navigate properly",
];

const KEEP = [
  // S
  "should present the form and display errors",
  "surface a validation error (metabase#4506)",
  "(metabase#13516)",
  "(metabase#13604)",
  "(metabase#14294)",
  "(metabase#10787)",
  "(#14635)",
  "Basic Auth",
  "Bearer Auth",
  "API Key - Header Auth",
  "Should allow you to create and edit Notifications",
  // Split
  "where to display the unit of currency",
  "should be able to save and clear email settings",
  "(metabase#11394, metabase#9151, metabase#12472)",
  // C
  "should show an error if test email fails",
];

describe("pilot spec verdicts", () => {
  it("finds every test, with forEach tests expanded", () => {
    expect(tests).toHaveLength(26);
    expect(new Set([...MOVE, ...KEEP].flatMap(find)).size).toBe(26);
  });

  it.each(MOVE)("puts %s in A or B", (fragment) => {
    const [test] = find(fragment);
    expect(test).toBeDefined();
    expect(["A", "B"]).toContain(test.bucket);
  });

  it.each(KEEP)("puts %s in C?", (fragment) => {
    const matches = find(fragment);
    expect(matches.length).toBeGreaterThan(0);
    matches.forEach((test) => expect(test.bucket).toBe("C?"));
  });

  it("sees the stubbed settings as A", () => {
    const [test] = find("MB_SITE_URL");
    expect(test.bucket).toBe("A");
    expect(test.issues).toEqual(["14900"]);
    expect(test.antiPatterns).toContain("absence check first after cy.visit");
  });

  it("reads tags and tokens from describe blocks and hooks", () => {
    expect(find("Basic Auth")[0].tags).toContain("@external");
    expect(find("hide the store link")[0].token).toBe("pro-self-hosted");
    expect(find("should show the store link")[0].tags).toEqual(["@OSS"]);
  });

  it("flags .get() chained on a subject", () => {
    expect(find("(metabase#13604)")[0].antiPatterns).toContain(
      ".get() chained on a subject",
    );
  });
});

describe("rules beyond the pilot", () => {
  const triage = (body: string, header = "") =>
    triageSource({
      source: `${header}\nconst { H } = cy;\ndescribe("d", () => { it("t", () => { ${body} }); });`,
      specPath: "x.cy.spec.js",
    })[0];

  it("puts a call into a spec helper in C?", () => {
    const body = `cy.visit("/"); QS.setupFilter();`;
    expect(triage(body, `import * as QS from "./shared/qs";`).bucket).toBe(
      "C?",
    );
    expect(triage(body, `const QS = { setupFilter() {} };`).bucket).toBe("B");
  });

  it("puts a wait on a query endpoint in C?", () => {
    const intercept = (url: string) =>
      `cy.intercept("POST", "${url}").as("q"); cy.visit("/"); cy.wait("@q");`;
    expect(triage(intercept("/api/dataset")).bucket).toBe("C?");
    expect(triage(intercept("/api/other")).bucket).toBe("B");
  });

  it("follows local functions", () => {
    const header = `function save() { cy.button("Save").click(); }`;
    expect(triage(`cy.visit("/"); save();`, header).bucket).toBe("C?");
    expect(triage(`cy.visit("/");`, header).bucket).toBe("B");
  });
});
