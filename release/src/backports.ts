import "dotenv/config";
import type { Octokit } from "@octokit/rest";
import dayjs from 'dayjs';

import { sendBackportReminder } from "./slack";

const RECENT_BACKPORT_THRESHOLD_HOURS = 8;

/** check open backports and send slack reminders about stale ones */
export const checkOpenBackports = async ({ github, owner, repo, channelName }: {
  github: Octokit,
  owner: string,
  repo: string,
  channelName: string,
}) => {

  const { data: openBackports } = await github.issues.listForRepo({
    owner,
    repo,
    labels: "was-backported",
    state: "open",
  });

  console.log(`Found ${openBackports.length} open backports`);

  const recentBackports = openBackports
    .filter(issue => dayjs().diff(dayjs(issue.created_at), 'hours') > RECENT_BACKPORT_THRESHOLD_HOURS);

  if (!recentBackports.length) {
    console.log("No recent backports to remind about");
    return;
  }

  console.log(`Reminding about ${recentBackports.length} recent backports`);

  sendBackportReminder({
    channelName,
    backports: recentBackports,
  });
}
