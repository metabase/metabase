import { execFileSync, spawnSync } from "child_process";
import {
  copyFileSync,
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
const resolver = join(__dirname, "../../bin/ui-package/resolve-release.sh");
const publish = workflow.jobs.publish.steps.find(
  (step) => step.name === "Publish the tarball to NPM",
)?.run;

interface ResolveSetupOpts {
  version?: string;
}

function resolveRelease({ version }: ResolveSetupOpts) {
  const cwd = mkdtempSync(join(tmpdir(), "resolve-ui-release-"));
  try {
    const manifest = join(cwd, "package.json");
    writeFileSync(manifest, JSON.stringify({ version }));
    return spawnSync("bash", [resolver], {
      encoding: "utf8",
      env: { ...process.env, UI_PACKAGE_JSON: manifest },
    });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

it.each([
  { version: "0.1.0", tag: "latest" },
  { version: "0.1.0-canary.5", tag: "canary" },
  { version: `0.1.0-canary.${"1".repeat(233)}`, tag: "canary" },
  { version: "9007199254740991.0.0", tag: "latest" },
])("resolves release outputs for $version", ({ version, tag }) => {
  const result = resolveRelease({ version });
  expect(result.status).toBe(0);
  expect(result.stdout).toBe(
    `version=${version}\nnpm_tag=${tag}\ngit_tag=ui-v${version}\n`,
  );
});

it.each([
  { name: "a missing version" },
  { name: "a trailing newline", version: "0.1.0\n" },
  { name: "a NUL character", version: "0.1.0\0" },
  { name: "an unsupported prerelease", version: "0.1.0-beta.5" },
  { name: "a leading zero", version: "0.01.0" },
  { name: "an oversized major", version: "9007199254740992.0.0" },
  { name: "an oversized minor", version: "0.9007199254740992.0" },
  { name: "an oversized patch", version: "0.1.9007199254740992" },
  {
    name: "a version too long for the Git tag lock file",
    version: `0.1.0-canary.${"1".repeat(234)}`,
  },
])("does not emit release outputs for $name", ({ version }) => {
  const result = resolveRelease({ version });
  expect(result.status).toBe(1);
  expect(result.stdout).toBe("");
});

it("packs a long canary version under a fixed filename", () => {
  const cwd = mkdtempSync(join(tmpdir(), "pack-ui-release-"));
  try {
    const manifest = {
      name: "@metabase/ui",
      version: `0.1.0-canary.${"1".repeat(233)}`,
    };
    mkdirSync(join(cwd, "scripts"));
    const packScript = join(cwd, "scripts/pack.ts");
    copyFileSync(
      join(__dirname, "../../frontend/ui-package/scripts/pack.ts"),
      packScript,
    );
    writeFileSync(join(cwd, "package.json"), JSON.stringify(manifest));
    execFileSync("bun", ["run", packScript], { cwd });

    const packedManifest: unknown = JSON.parse(
      execFileSync(
        "tar",
        ["-xzOf", ".pack/metabase-ui.tgz", "package/package.json"],
        {
          cwd,
          encoding: "utf8",
        },
      ),
    );
    expect(packedManifest).toEqual(manifest);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

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
