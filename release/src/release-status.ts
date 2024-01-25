/* eslint-disable no-console */
import type { Octokit } from "@octokit/rest";
import dayjs from "dayjs";

import { getChannelTopic, sendPreReleaseStatus } from "./slack";
import { getMilestoneIssues, findMilestone } from "./github";


const DATE_FORMAT = "ddd, MMM DD";
// if we're more than 3 days out from a release, don't spam slack
const MIN_DAYS_TO_RELEASE = 3;

async function getReleaseInfo({
  channelName
}: {
  channelName: string;
}) {
  const topic = await getChannelTopic(channelName);

  if (!topic) {
    throw new Error(`No channel topic found for ${channelName}`);
  }
  const matches = Array.from(topic.matchAll(/Next Release\:\s(.+)\son\s(.+)\b/ig));

  if (!matches?.length) {
    throw new Error("No release date found in channel topic");
  }

  return matches.map(([, version, date]) => ({
    version,
    date: dayjs(date).format(DATE_FORMAT),
    dateDiff: dayjs(date).diff(dayjs(), 'day')
  }));
}

export async function checkReleaseStatus({
  channelName,
  github,
  owner,
  repo,
} : {
  channelName: string,
  github: Octokit,
  owner: string,
  repo: string,
}) {
  const releaseInfo = await getReleaseInfo({ channelName });
  console.log(releaseInfo);

  releaseInfo.forEach(async ({ version, date, dateDiff }) => {
    if (dateDiff > MIN_DAYS_TO_RELEASE) {
      return;
    }
    const milestone = await findMilestone({ version, github, owner, repo });
    if (!milestone) {
      console.log(`No milestone found for ${version}`);
      return;
    }
    const openIssues = await getMilestoneIssues({
      github,
      owner,
      repo,
      version,
      state: 'open'
    });

    await sendPreReleaseStatus({
      channelName,
      version,
      date,
      openIssues,
      closedIssueCount: milestone.closed_issues,
      milestoneId: milestone.number
    });
  });
}
