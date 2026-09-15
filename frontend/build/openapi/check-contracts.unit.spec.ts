import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

import {
  BASELINE_PATH,
  CONTRACTS_REPORT_PATH,
  GENERATED_DECLARATIONS_PATH,
} from "./paths";

const SCRIPT = path.join(__dirname, "check-contracts.ts");
const ENDPOINT_ID = "endpoints:example";

function endpointSource(user: string) {
  return `
    type EndpointBuilder = { query<R, A>(definition: { query: (args: A) => unknown }): unknown };
    declare const renamed: EndpointBuilder;
    type User = ${user};
    const endpoints = { example: renamed /* a comment must not hide this call */
      . /* another comment */ query<User, void>({ query: () => ({ url: "/api/user" }) }) };
  `;
}

function generatedDeclarations({
  body = "body?: never",
  email = "string | null",
} = {}) {
  return `
    export type GetApiUserData = { url: "/api/user"; ${body}; query?: never; path?: never };
    export type Owner = { email: ${email} };
    export type GetApiUserResponses = { "2XX": { owner: Owner } };
  `;
}

describe("contract checker CLI", () => {
  let root: string;

  const write = (relativePath: string, contents: string) => {
    const target = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  };
  const read = (relativePath: string) =>
    fs.readFileSync(path.join(root, relativePath), "utf8");
  const run = (...args: string[]) =>
    spawnSync("bun", [SCRIPT, ...args], { cwd: root, encoding: "utf8" });

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "contract-checker-cli-"));
    write(
      "tsconfig.json",
      JSON.stringify({
        compilerOptions: { strict: true, skipLibCheck: true },
        include: ["frontend/src/**/*.ts"],
      }),
    );
    write(
      "frontend/src/api.ts",
      endpointSource("{ owner: { email: string } }"),
    );
    write(GENERATED_DECLARATIONS_PATH, generatedDeclarations());
    write(BASELINE_PATH, "[]");
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it("should explain exempted nested mismatches without changing the baseline", () => {
    const baseline = JSON.stringify([ENDPOINT_ID]);
    write(BASELINE_PATH, baseline);
    const result = run("--explain", "example");
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/\$\.owner\.email/);
    expect(result.stdout).toMatch(
      /backend type null is not assignable to frontend type string/,
    );
    expect(read(BASELINE_PATH)).toBe(baseline);
  });

  it("should still fail the gate in explanation mode", () => {
    const result = run("--explain", "example");
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/\$\.owner\.email/);
  });

  it("should point to the fix-api-contract skill after failing gate output", () => {
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr.trimEnd()).toMatch(
      /To investigate and fix these, see \.claude\/skills\/fix-api-contract\/SKILL\.md\.$/,
    );
  });

  it("should fail the gate for an optional frontend field absent from the backend", () => {
    write(
      "frontend/src/api.ts",
      endpointSource("{ owner: { email: string | null; nickname?: string } }"),
    );
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(
      /\$\.owner\.nickname.*not declared in the backend/,
    );
  });

  it("should reject an explanation filter that matches no endpoints", () => {
    const result = run("--explain", "missingEndpoint");
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/No contract checks match/);
  });

  it.each([
    { args: ["--unknown"] },
    { args: ["--update-baseline", "--explain", "example"] },
  ])("should print usage for arguments $args", ({ args }) => {
    const result = run(...args);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/Usage: bun run api-contract-check-pure/);
  });

  it("should fail when generated declarations are absent", () => {
    fs.rmSync(path.join(root, ".tmp"), { recursive: true });
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/Missing generated declarations/);
  });

  it("should update the baseline once per failing endpoint and keep every diagnostic", () => {
    write(
      GENERATED_DECLARATIONS_PATH,
      generatedDeclarations({ body: "body: { name: string }" }),
    );
    write(BASELINE_PATH, JSON.stringify(["removedApi:oldEndpoint"]));

    const update = run("--update-baseline");
    expect(update.stderr).toBe("");
    expect(update.status).toBe(0);
    expect(JSON.parse(read(BASELINE_PATH))).toEqual([ENDPOINT_ID]);

    const result = run();
    expect(result.status).toBe(0);
    expect(JSON.parse(read(CONTRACTS_REPORT_PATH))).toMatchObject({
      endpointCount: 1,
      exemptEndpoints: [ENDPOINT_ID],
      results: [
        { id: `${ENDPOINT_ID}:request.body`, status: "mismatch" },
        { id: `${ENDPOINT_ID}:request.query`, status: "compatible" },
        { id: `${ENDPOINT_ID}:response.2XX`, status: "mismatch" },
      ],
    });

    write(BASELINE_PATH, "[]");
    expect(run().status).toBe(1);
  });

  it("should report stale exemptions without failing or editing the baseline", () => {
    write(
      GENERATED_DECLARATIONS_PATH,
      generatedDeclarations({ email: "string" }),
    );
    const baseline = JSON.stringify([ENDPOINT_ID, "removedApi:oldEndpoint"]);
    write(BASELINE_PATH, baseline);
    const result = run();
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(
      /2 endpoint exemptions have no current failures/,
    );
    expect(JSON.parse(read(CONTRACTS_REPORT_PATH))).toMatchObject({
      staleExemptions: [ENDPOINT_ID, "removedApi:oldEndpoint"],
    });
    expect(read(BASELINE_PATH)).toBe(baseline);
  });

  it("should not let a stale exemption hide an unexempted endpoint's failure", () => {
    write(BASELINE_PATH, JSON.stringify(["removedApi:oldEndpoint"]));
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/endpoints:example:response\.2XX/);
  });

  it.each([
    { baseline: { oldCheck: "mismatch" } },
    { baseline: [42] },
    { baseline: [""] },
    { baseline: null },
  ])("should reject malformed baseline $baseline", ({ baseline }) => {
    write(BASELINE_PATH, JSON.stringify(baseline));
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/array of non-empty endpoint IDs/);
  });
});
