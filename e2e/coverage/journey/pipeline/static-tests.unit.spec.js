import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SPEC = "e2e/test/scenarios/fixture.cy.spec.js";

function staticAsserts(source) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "static-tests-"));
  try {
    fs.mkdirSync(path.join(dir, path.dirname(SPEC)), { recursive: true });
    fs.mkdirSync(path.join(dir, "e2e/support"));
    fs.writeFileSync(path.join(dir, SPEC), source);
    const testsFile = path.join(dir, "tests.json");
    fs.writeFileSync(
      testsFile,
      JSON.stringify({
        tests: [{ id: 0, spec: SPEC, title: "fixture checks a value" }],
      }),
    );
    const outFile = path.join(dir, "static-tests.json");
    execFileSync(
      process.execPath,
      [path.join(__dirname, "static-tests.mjs"), dir, testsFile, outFile],
      { stdio: "ignore" },
    );
    const { staticTests } = JSON.parse(fs.readFileSync(outFile, "utf8"));
    return staticTests[0].events
      .filter((event) => event.kind === "assert")
      .map((event) => [event.text, event.src]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe("static-tests.mjs", () => {
  it("should record chai assertions that end on a property as well as on a call", () => {
    const source = [
      'describe("fixture", () => {',
      '  it("checks a value", () => {',
      "    cy.wrap(1).then((value) => {",
      "      expect(value).to.exist;",
      "      expect(value).to.equal(1);",
      '      expect([value]).to.be.an("array").and.not.be.empty;',
      "    });",
      "  });",
      "});",
      "",
    ].join("\n");

    expect(staticAsserts(source)).toEqual([
      ["expect(value).to.exist", "test/scenarios/fixture.cy.spec.js:4"],
      ["expect(value).to.equal(1)", "test/scenarios/fixture.cy.spec.js:5"],
      [
        'expect([value]).to.be.an("array").and.not.be.empty',
        "test/scenarios/fixture.cy.spec.js:6",
      ],
    ]);
  });
});
