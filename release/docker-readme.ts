import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";

import { Octokit } from "@octokit/rest";

import {
  type DockerEdition,
  generateDockerReadme,
  pushDockerReadme,
} from "./src/docker-readme";

const DEFAULT_TEMPLATE_PATHS: Record<DockerEdition, string> = {
  oss: path.join(import.meta.dirname, "../bin/docker/README.md"),
  ee: path.join(import.meta.dirname, "../bin/docker/README-enterprise.md"),
};

const USAGE = `Usage:
  bun docker-readme [--edition oss|ee] [--latest-major 64] [--template path] [--repository owner/name] [--publish]

Prints the generated Docker Hub README. With --publish, also pushes it to the repository.

--edition       oss (default) or ee. Picks v0 or v1 tags.
--latest-major  defaults to LATEST_MAJOR_VERSION
--template      defaults to bin/docker/README.md (oss) or bin/docker/README-enterprise.md (ee)
--repository    defaults to DOCKERHUB_OWNER/DOCKERHUB_REPO (oss) or DOCKERHUB_OWNER/DOCKERHUB_REPO-enterprise (ee)

Env: GITHUB_TOKEN, AWS_S3_STATIC_BUCKET, AWS_REGION,
     DOCKERHUB_RELEASE_USERNAME and DOCKERHUB_RELEASE_TOKEN (for --publish)`;

const isDockerEdition = (value: string): value is DockerEdition =>
  value === "oss" || value === "ee";

async function main() {
  const { values } = parseArgs({
    options: {
      edition: { type: "string", default: "oss" },
      "latest-major": { type: "string" },
      template: { type: "string" },
      repository: { type: "string" },
      publish: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help) {
    console.log(USAGE);
    return;
  }

  const {
    GITHUB_TOKEN,
    GITHUB_OWNER = "metabase",
    GITHUB_REPO = "metabase",
    LATEST_MAJOR_VERSION,
    DOCKERHUB_OWNER,
    DOCKERHUB_REPO,
    DOCKERHUB_RELEASE_USERNAME,
    DOCKERHUB_RELEASE_TOKEN,
  } = process.env;

  const { edition } = values;
  if (!isDockerEdition(edition)) {
    throw new Error(`Invalid --edition: ${edition}\n\n${USAGE}`);
  }

  const latestMajorVersion = values["latest-major"] ?? LATEST_MAJOR_VERSION;
  if (!latestMajorVersion) {
    throw new Error(`Missing --latest-major\n\n${USAGE}`);
  }

  const readme = await generateDockerReadme({
    github: new Octokit({ auth: GITHUB_TOKEN }),
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    latestMajorVersion,
    edition,
    template: await readFile(
      values.template ?? DEFAULT_TEMPLATE_PATHS[edition],
      "utf8",
    ),
  });

  console.log(readme);

  if (!values.publish) {
    return;
  }

  const repository =
    values.repository ??
    (DOCKERHUB_OWNER && DOCKERHUB_REPO
      ? `${DOCKERHUB_OWNER}/${DOCKERHUB_REPO}${edition === "ee" ? "-enterprise" : ""}`
      : undefined);
  if (!repository) {
    throw new Error(`Missing --repository\n\n${USAGE}`);
  }
  if (!DOCKERHUB_RELEASE_USERNAME || !DOCKERHUB_RELEASE_TOKEN) {
    throw new Error(
      "Missing DOCKERHUB_RELEASE_USERNAME or DOCKERHUB_RELEASE_TOKEN",
    );
  }

  await pushDockerReadme({
    readme,
    repository,
    username: DOCKERHUB_RELEASE_USERNAME,
    token: DOCKERHUB_RELEASE_TOKEN,
  });

  console.log(`\nPublished README to https://hub.docker.com/r/${repository}`);
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
