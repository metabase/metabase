// note: this file really isn't release-related, but the build tooling here is helpful for it
import _ from 'underscore';
import "dotenv/config";
import "zx/globals";

import type { GithubProps } from './flakes-helpers';
import {
  getFlakeData,
  getOpenFlakeIssues,
  createFlakeIssue,
  updateFlakeIssue,
  getRecentlyClosedFlakeIssues,
  checkIfFlakeIssueExists,
  summarizeOpenFlakes,
  summarizeClosedFlakes,
} from './flakes-helpers';
import { sendFlakeStatusReport } from './slack';

/**
 * Creates new github issues for newly-appearing flakes, updates github issues for persistent flakes,
 * should skip creating issues for recently closed flakes
 */
export async function updateFlakeIssues({
  owner,
  repo,
  github
}: GithubProps) {
  const flakeData = await getFlakeData();
  const openFlakeIssues = await getOpenFlakeIssues({ github, owner, repo });
  const recentlyClosedFlakeIssues = await getRecentlyClosedFlakeIssues({ github, owner, repo });

  for (const flake of flakeData) { // use a for loop to avoid rate limiting
    const flakeIssueRecentlyClosed = checkIfFlakeIssueExists({ test: flake, flakeIssues: recentlyClosedFlakeIssues });

    if (flakeIssueRecentlyClosed) {
      console.log(`🙈 Flake issue was recently closed for\n    ${flake.test_name}`);
      continue;
    }

    const openFlakeIssue = checkIfFlakeIssueExists({ test: flake, flakeIssues: openFlakeIssues });

    if (openFlakeIssue) {
      console.log(`🤫 Flake issue already exists for\n    ${flake.test_name}`);
      await updateFlakeIssue({ test: flake, issue: openFlakeIssue, github, owner, repo });
      continue;
    }

    await createFlakeIssue({ test: flake, github, owner, repo });
  }
}

/**
 * Sends a slack message summarizing all open flake issues by team and commending the brave souls who have
 * recently closed flake issues
 */
export async function summarizeFlakes({ owner, repo, github, channelName }: GithubProps & { channelName: string}) {
  const openFlakeInfo = await summarizeOpenFlakes({ owner, repo, github });
  const closedFlakeInfo = await summarizeClosedFlakes({ owner, repo, github });

  await sendFlakeStatusReport({
    channelName,
    openFlakeInfo,
    closedFlakeInfo,
  });
}
