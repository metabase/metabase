import { execFileSync, spawnSync } from "child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { load } from "js-yaml";

// The checked-in workflow defines the publish job and its named run step.
const workflow = load(
  readFileSync(join(__dirname, "../workflows/release-ui-package.yml"), "utf8"),
) as { jobs: { publish: { steps: { name: string; run?: string }[] } } };
const publish = workflow.jobs.publish.steps.find(
  (step) => step.name === "Publish the tarball to NPM",
)?.run;

interface SetupOpts {
  name?: string;
  releaseVersion?: string;
  packedVersion?: string;
  tarballs?: number;
  tag?: string;
}

function simulatePublish({
  name = "@metabase/ui",
  releaseVersion = "0.1.0",
  packedVersion = releaseVersion,
  tarballs = 1,
  tag = "latest",
}: SetupOpts = {}) {
  const cwd = mkdtempSync(join(tmpdir(), "release-ui-package-"));
  try {
    mkdirSync(join(cwd, "package"));
    mkdirSync(join(cwd, "pack"));
    writeFileSync(
      join(cwd, "package/package.json"),
      JSON.stringify({ name, version: packedVersion }),
    );
    for (let i = 0; i < tarballs; i++) {
      execFileSync("tar", ["-czf", `pack/artifact-${i}.tgz`, "package"], {
        cwd,
      });
    }
    if (!publish) {
      throw new Error("Release workflow is missing the npm publish step");
    }
    return spawnSync(
      "bash",
      [
        "-e",
        "-o",
        "pipefail",
        "-c",
        `npm() { printf 'npm arg: %s\\n' "$@"; }\n${publish}`,
      ],
      {
        cwd,
        encoding: "utf8",
        env: {
          ...process.env,
          VERSION: releaseVersion,
          NPM_TAG: tag,
        },
      },
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

it.each([
  { version: "0.1.0", tag: "latest", tagArgs: [] },
  { version: "0.1.0-canary.1", tag: "canary", tagArgs: ["--tag", "canary"] },
])("publishes the downloaded archive to $tag", ({ version, tag, tagArgs }) => {
  const result = simulatePublish({ releaseVersion: version, tag });
  expect(result.status).toBe(0);
  expect(result.stdout.trimEnd().split("\n")).toEqual(
    ["publish", "./pack/artifact-0.tgz", "--access", "public", ...tagArgs].map(
      (arg) => `npm arg: ${arg}`,
    ),
  );
});

it("rejects another package's archive even when its version matches", () => {
  const result = simulatePublish({ name: "@metabase/custom-viz" });
  expect(result.stdout).not.toContain("npm arg: publish");
  expect(result.status).toBe(1);
  expect(result.stdout).toContain(
    "Tarball package name '@metabase/custom-viz'",
  );
});

it("rejects a different version of the same package", () => {
  const result = simulatePublish({ packedVersion: "0.1.1" });
  expect(result.status).toBe(1);
  expect(result.stdout).toContain("Tarball version '0.1.1'");
  expect(result.stdout).not.toContain("npm arg: publish");
});

it.each([0, 2])("rejects a download with %i tarballs", (tarballs) => {
  const result = simulatePublish({ tarballs });
  expect(result.status).toBe(1);
  expect(result.stdout).toContain(
    `Expected exactly one tarball in pack/, got ${tarballs}`,
  );
  expect(result.stdout).not.toContain("npm arg: publish");
});
