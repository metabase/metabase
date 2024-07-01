// changelog preview only, doesn't publish anything
import "dotenv/config";
import { Octokit } from "@octokit/rest";
import "zx/globals";

import {
  isValidVersionString,
  hasBeenReleased,
  getChangelog,
} from "./src";

const {
  GITHUB_TOKEN,
  GITHUB_OWNER,
  GITHUB_REPO,
} = process.env as any;

if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
  console.error("You must provide GITHUB_* environment variables in .env-template");
}

const github = new Octokit({ auth: GITHUB_TOKEN });

const version = process.argv?.[2]?.trim();

if (!isValidVersionString(version)) {
  console.error(
    "You must provide a valid version string as the first argument (e.g v0.45.6)",
  );
}

const notes = await getChangelog({
  version, github,
  owner: GITHUB_OWNER,
  repo: GITHUB_REPO,
});

console.log(notes);

