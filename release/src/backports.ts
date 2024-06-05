import "dotenv/config";
import { Octokit } from "@octokit/rest";
import { check } from "prettier";

import { sendBackportReminder } from "./slack";

const github = new Octokit({ auth: process.env.GITHUB_TOKEN });

export const checkOpenBackports = async ({ github, owner, repo }: {
  github: Octokit,
  owner: string,
  repo: string,
}) => {

  const { data: openBackports } = await github.issues.listForRepo({
    owner,
    repo,
    labels: "was-backported",
    state: "open",
  });

  console.log(`Found ${openBackports.length} open backports`);

  sendBackportReminder({
    channelName: "engineering-ci", // FIXME: use CI_CHANNEL_NAME
    backports: openBackports,
  });


}

checkOpenBackports({ github, owner: "metabase", repo: "metabase" });
