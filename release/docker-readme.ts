import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";

import { Octokit } from "@octokit/rest";

import { generateDockerReadme, pushDockerReadme } from "./src/docker-readme";

const TEMPLATE_PATH = path.join(import.meta.dirname, "../bin/docker/README.md");

const USAGE = `Usage:
  bun docker-readme [--latest-major 64] [--repository owner/name] [--publish]

Prints the generated Docker Hub README. With --publish, also pushes it to the repository.

--latest-major  defaults to LATEST_MAJOR_VERSION
--repository    defaults to DOCKERHUB_OWNER/DOCKERHUB_REPO

Env: GITHUB_TOKEN, AWS_S3_STATIC_BUCKET, AWS_REGION,
     DOCKERHUB_RELEASE_USERNAME and DOCKERHUB_RELEASE_TOKEN (for --publish)`;

async function main() {
  const { values } = parseArgs({
    options: {
      "latest-major": { type: "string" },
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

  const latestMajorVersion = values["latest-major"] ?? LATEST_MAJOR_VERSION;
  if (!latestMajorVersion) {
    throw new Error(`Missing --latest-major\n\n${USAGE}`);
  }

  const readme = await generateDockerReadme({
    github: new Octokit({ auth: GITHUB_TOKEN }),
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    latestMajorVersion,
    template: await readFile(TEMPLATE_PATH, "utf8"),
  });

  console.log(readme);

  if (!values.publish) {
    return;
  }

  const repository =
    values.repository ??
    (DOCKERHUB_OWNER && DOCKERHUB_REPO
      ? `${DOCKERHUB_OWNER}/${DOCKERHUB_REPO}`
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
