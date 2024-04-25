import { WebClient } from '@slack/web-api';
import type { Issue } from './types';
import { getGenericVersion } from "./version-helpers";
import { findMilestone } from "./github";
import type { ReleaseProps } from "./types";

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);
const SLACK_CHANNEL_NAME = process.env.SLACK_RELEASE_CHANNEL ?? "bot-testing";

export function getChannelTopic(channelName: string) {
  return slack.conversations.list({
    types: 'public_channel',
  }).then(response => {
    const channel = response?.channels?.find(channel => channel.name === channelName);
    return channel?.topic?.value;
  });
}

export async function sendPreReleaseStatus({
  channelName, version, date, openIssues, closedIssueCount, milestoneId
}: {
  channelName: string,
  version: string,
  date: string,
  openIssues: Issue[],
  closedIssueCount: number,
  milestoneId: number,
}) {
  const blockerText = `* ${openIssues.length } Blockers*
${openIssues.map(issue => `  • <${issue.html_url}|#${issue.number} - ${issue.title}> - @${issue.assignee?.login ?? 'unassigned'}`).join("\n")}`;

  const blocks = [
    {
			"type": "header",
			"text": {
				"type": "plain_text",
				"text": `:rocket:  Upcoming ${version} Release Status`,
				"emoji": true
			}
		},
    {
			"type": "section",
			"text": {
				"type": "mrkdwn",
				"text": `_<https://github.com/metabase/metabase/milestone/${milestoneId}|:direction-sign: Milestone> targeted for release on ${date}_`,
			}
		},
  ];

  const attachments = [
    {
      "color": "#32a852",
      "blocks": [{
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": `*${closedIssueCount} Closed Issues*`,
        }
      }],
    },
    {
      "color": "#a83632",
      "blocks": [{
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": blockerText,
        }
      }],
    },
  ];

  return slack.chat.postMessage({
    channel: channelName,
    blocks,
    attachments,
    text: `${version} is scheduled for release on ${date}`,
  });
}

type BuildStage =
  | "build-start"
  | "build-done"
  | "test-start"
  | "test-done"
  | "publish-start"
  | "publish-done";

function sendSlackMessage({ channelName = SLACK_CHANNEL_NAME, message }: { channelName?: string, message: string }) {
  return slack.chat.postMessage({
    channel: channelName,
    text: message,
  });
}

const getReleaseTitle = (version: string) =>
  `:rocket: *${getGenericVersion(version)} Release* :rocket:`;

function slackLink(text: string, url: string) {
  return `<${url}|${text}>`;
}

function githubRunLink(
  text: string,
  runId: string,
  owner: string,
  repo: string,
) {
  return slackLink(
    text,
    `https://github.com/${owner}/${repo}/actions/runs/${runId}`,
  );
}

export async function sendReleaseMessage({
  github,
  owner,
  repo,
  stage,
  version,
  runId,
  releaseSha,
}: ReleaseProps & {
  stage: BuildStage;
  version: string;
  runId: string;
  releaseSha: string;
}) {

  const title = getReleaseTitle(version);
  const space = "\n";
  let message = "";

  if (stage === "build-start") {
    const milestone = await findMilestone({ version, github, owner, repo });
    console.log("Milestone", milestone);
    const milestoneLink = milestone?.number
      ? slackLink(
          `_:direction-sign: Milestone_`,
          `https://github.com/${owner}/${repo}/milestone/${milestone.number}?closed=1`,
        )
      : "";

    const releaseCommitLink = slackLink(
      `_:merged: Release Commit_`,
      `https://github.com/${owner}/${repo}/commit/${releaseSha}`,
    );

    const githubBuildLink = githubRunLink("_🏗️ CI Build_", runId, owner, repo);

    const preReleaseMessage = [
      releaseCommitLink,
      milestoneLink,
      githubBuildLink,
    ].filter(Boolean).join(" - ");

    message = [
      title,
      preReleaseMessage,
    ].join(space);
  }

  if (message) {
    await sendSlackMessage({ message });
    return;
  }

  console.error(`No message to send for ${stage}`);
}
