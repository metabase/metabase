import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

const script = resolve("frontend/build/openapi/check-contracts.ts");

describe("contract checker CLI", () => {
  let root: string;
  const endpointId = "endpoints:example";
  const write = (path: string, contents: string) => {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, contents);
  };
  const run = (...args: string[]) =>
    spawnSync("bun", [script, ...args], { cwd: root, encoding: "utf8" });

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "contract-checker-cli-"));
    write(
      "tsconfig.json",
      JSON.stringify({
        compilerOptions: { strict: true, skipLibCheck: true },
        include: ["frontend/src/**/*.ts"],
      }),
    );
    write(
      "frontend/src/api.ts",
      `
      type EndpointBuilder = { query<R, A>(definition: { query: (args: A) => unknown }): unknown };
      declare const renamed: EndpointBuilder;
      type User = { owner: { email: string } };
      const endpoints = { example: renamed /* a comment must not hide this call */
        . /* another comment */ query<User, void>({ query: () => ({ url: "/api/user" }) }) };
    `,
    );
    write(
      ".tmp/openapi/types/types.gen.d.ts",
      `
      export type GetApiUserData = { url: "/api/user"; body?: never; query?: never; path?: never };
      export type Owner = { email: string | null };
      export type GetApiUserResponses = { "2XX": { owner: Owner } };
    `,
    );
    write("frontend/build/openapi/baseline.json", "[]");
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("explains exempted nested mismatches without changing the baseline", () => {
    const baseline = JSON.stringify([endpointId]);
    write("frontend/build/openapi/baseline.json", baseline);
    const result = run("--explain", "example");
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /\$\.owner\.email/);
    assert.match(result.stdout, /null is not assignable to string/);
    assert.equal(
      readFileSync(join(root, "frontend/build/openapi/baseline.json"), "utf8"),
      baseline,
    );
  });

  it("still fails the global gate in explanation mode", () => {
    const result = run("--explain", "example");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /\$\.owner\.email/);
  });

  it("fails the gate for an optional frontend field absent from the backend", () => {
    write(
      "frontend/src/api.ts",
      `
      declare const builder: { query<R, A>(definition: { query: (args: A) => unknown }): unknown };
      type User = { owner: { email: string | null; nickname?: string } };
      const endpoints = { example: builder.query<User, void>({ query: () => ({ url: "/api/user" }) }) };
    `,
    );
    const result = run();
    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /\$\.owner\.nickname.*not declared in the backend/,
    );
  });

  it("rejects an explanation filter that matches no endpoints", () => {
    const result = run("--explain", "missingEndpoint");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /No contract checks match/);
  });

  it("fails when generated declarations are absent", () => {
    rmSync(join(root, ".tmp"), { recursive: true });
    const result = run();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Missing generated declarations/);
  });

  it("updates the baseline once per failing endpoint and keeps every diagnostic", () => {
    const generated = ".tmp/openapi/types/types.gen.d.ts";
    write(
      generated,
      readFileSync(join(root, generated), "utf8").replace(
        "body?: never",
        "body: { name: string }",
      ),
    );
    write(
      "frontend/build/openapi/baseline.json",
      JSON.stringify(["removedApi:oldEndpoint"]),
    );
    const update = run("--update-baseline");
    assert.equal(update.status, 0, update.stderr);
    assert.deepEqual(
      JSON.parse(
        readFileSync(
          join(root, "frontend/build/openapi/baseline.json"),
          "utf8",
        ),
      ),
      [endpointId],
    );
    const result = run();
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(
      readFileSync(join(root, ".tmp/openapi/contracts-report.json"), "utf8"),
    );
    assert.equal(report.endpointCount, 1);
    assert.deepEqual(report.exemptEndpoints, [endpointId]);
    assert.ok(
      report.results.filter((r: { status: string }) => r.status === "mismatch")
        .length >= 2,
    );
    write("frontend/build/openapi/baseline.json", "[]");
    assert.equal(run().status, 1);
  });

  it("reports stale exemptions without failing or editing the baseline", () => {
    const generated = ".tmp/openapi/types/types.gen.d.ts";
    write(
      generated,
      readFileSync(join(root, generated), "utf8").replace(
        "string | null",
        "string",
      ),
    );
    const baseline = JSON.stringify([endpointId, "removedApi:oldEndpoint"]);
    write("frontend/build/openapi/baseline.json", baseline);
    const result = run();
    assert.equal(result.status, 0, result.stderr);
    assert.match(
      result.stdout,
      /2 endpoint exemptions have no current failures/,
    );
    const report = JSON.parse(
      readFileSync(join(root, ".tmp/openapi/contracts-report.json"), "utf8"),
    );
    assert.deepEqual(report.staleExemptions, [
      endpointId,
      "removedApi:oldEndpoint",
    ]);
    assert.equal(
      readFileSync(join(root, "frontend/build/openapi/baseline.json"), "utf8"),
      baseline,
    );
  });

  it("does not let a stale exemption hide an unexempted endpoint's failure", () => {
    write(
      "frontend/build/openapi/baseline.json",
      JSON.stringify(["removedApi:oldEndpoint"]),
    );
    const result = run();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /endpoints:example:response.2XX/);
  });

  for (const baseline of [{ oldCheck: "mismatch" }, [42], [""], null]) {
    it(`rejects malformed baseline ${JSON.stringify(baseline)}`, () => {
      write("frontend/build/openapi/baseline.json", JSON.stringify(baseline));
      const result = run();
      assert.equal(result.status, 1);
      assert.match(result.stderr, /array of non-empty endpoint IDs/);
    });
  }
});
