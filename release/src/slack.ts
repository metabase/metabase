import 'dotenv/config';
import fs from 'fs';

import { WebClient } from '@slack/web-api';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import fetch from 'node-fetch';

dayjs.extend(relativeTime);
import _githubSlackMap from "../github-slack-map.json";

const githubSlackMap: Record<string, string> = _githubSlackMap;

import { findMilestone } from "./github";
import type { Issue , ReleaseProps } from './types';
import { getGenericVersion } from "./version-helpers";

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);
const SLACK_CHANNEL_NAME = process.env.SLACK_RELEASE_CHANNEL ?? "bot-testing";

export function mentionUserByGithubLogin(githubLogin?: string | null) {
  if (githubLogin && githubLogin in githubSlackMap) {
    return `<@${githubSlackMap[githubLogin]}>`;
  }
  return `@${githubLogin ?? 'unassigned'}`;
}

export function mentionSlackTeam(teamName: string) {
  return `<!subteam^${githubSlackMap[teamName]}|${teamName}>`;
}

export function getChannelTopic(channelName: string) {
  return slack.conversations.list({
    types: 'public_channel',
  }).then(response => {
    const channel = response?.channels?.find(channel => channel.name === channelName);
    return channel?.topic?.value;
  });
}

function formatBackportItem(issue: Omit<Issue, 'labels'>,) {
  const age = dayjs(issue.created_at).fromNow();
  return `${mentionUserByGithubLogin(issue.assignee?.login)} - ${slackLink(issue.title, issue.html_url)} - ${age}`;
}

export async function sendBackportReminder({
  channelName, backports,
}: {
  channelName: string,
  backports: Omit<Issue, 'labels'>[],
}) {
  const text = backports
    .reverse()
    .map(formatBackportItem).join("\n");

    const blocks = [
      {
        "type": "header",
        "text": {
          "type": "plain_text",
          "text": `:shame-conga: ${backports.length} Open Backports :shame-conga:`,
          "emoji": true
        }
      },
      {
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": `_${
            slackLink('See all open backports','https://github.com/metabase/metabase/pulls?q=is%3Aopen+is%3Apr+label%3Awas-backported')} | ${
            slackLink('Should I backport this?', 'https://www.notion.so/metabase/Metabase-Branching-Strategy-6eb577d5f61142aa960a626d6bbdfeb3?pvs=4#89f80d6f17714a0198aeb66c0efd1b71')}_`,
        }
      },
    ];

    const attachments = [
      {
        "color": "#F9841A",
        "blocks": [{
          "type": "section",
          "text": {
            "type": "mrkdwn",
            "text": text,
          }
        }],
      },
    ];

    return slack.chat.postMessage({
      channel: channelName,
      blocks,
      attachments,
      text: `${backports.length} open backports`,
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
    ${openIssues.map(issue => `  • <${issue.html_url}|#${issue.number} - ${issue.title}> - ${mentionUserByGithubLogin(issue.assignee?.login)}`).join("\n")}`;

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
				"text": `_<https://github.com/metabase/metabase/milestone/${milestoneId}|:direction-sign: Milestone> targeted for release on ${date}_ ${mentionSlackTeam('core-release')}`,
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

function sendSlackMessage({ channelName = SLACK_CHANNEL_NAME, message }: { channelName?: string, message: string }) {
  return slack.chat.postMessage({
    channel: channelName,
    text: message,
  });
}

async function getSlackChannelId(channelName: string) {
  const response = await slack.conversations.list({
    limit: 9999,
    exclude_archived: true,
  });
  return response.channels?.find((channel) => channel.name === channelName)?.id;
}

async function getExistingSlackMessage(version: string, channelName: string) {
  const channelId = await getSlackChannelId(channelName);
  if (!channelId) {
    throw new Error(`Could not find channel ${channelName}`);
  }

  const response = await slack.conversations.history({
    channel: channelId,
  });

  const existingMessage = response.messages?.find(
    message => message.text?.includes(getReleaseTitle(version)),
  );

  if (!existingMessage) {
    return null;
  }

  return {
    id: existingMessage.ts ?? '',
    body: existingMessage.text ?? '',
  };
}

async function sendSlackReply({ channelName, message, messageId, broadcast }: {channelName: string, message: string, messageId?: string, broadcast?: boolean}) {
  const channelId = await getSlackChannelId(channelName);
  if (!channelId) {
    throw new Error(`Could not find channel ${channelName}`);
  }

  return slack.chat.postMessage({
    channel: channelId,
    text: message,
    thread_ts: messageId, // if this is empty it should post in the channel
    reply_broadcast: !!broadcast,
  });
}

const getReleaseTitle = (version: string) =>
  `:rocket: *${getGenericVersion(version)} Release* :rocket:`;

export function slackLink(text: string, url: string) {
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

export async function sendPreReleaseMessage({
  github,
  owner,
  repo,
  version,
  runId,
  releaseSha,
  channelName,
  userName,
}: ReleaseProps & {
  version: string;
  runId: string;
  releaseSha: string;
  channelName: string,
  userName: string,
}) {
  const title = getReleaseTitle(version);

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
    userName ? `started by ${mentionUserByGithubLogin(userName)}` : null
  ].filter(Boolean).join(" - ");

  const message = `${title}\n${preReleaseMessage}`;

  await sendSlackMessage({ message, channelName });
}

export async function sendTestsCompleteMessage({
  channelName,
  version,
  runId,
  testStatus,
  owner,
  repo,
}: {
  channelName: string,
  version: string,
  runId: number,
  testStatus: 'success' | 'failure',
  owner: string,
  repo: string,
}) {
  const message = testStatus === 'success'
    ? `:very-green-check: ${getGenericVersion(version)} ${githubRunLink("Pre-release Tests Passed", runId.toString(), owner, repo)}`
    : `:x: ${getGenericVersion(version)} ${githubRunLink("Pre-release Tests Failed", runId.toString(), owner, repo)}`;

  const buildThread = await getExistingSlackMessage(version, channelName);

  await sendSlackReply({ channelName, message, messageId: buildThread?.id });
}

export async function sendPublishStartMessage({
  channelName,
  version,
  runId,
  owner,
  repo,
}: {
  channelName: string,
  version: string,
  runId: number,
  owner: string,
  repo: string,
}) {
  const message = `:loading: ${githubRunLink(`Publishing ${getGenericVersion(version)}`, runId.toString(), owner, repo)}`;
  const buildThread = await getExistingSlackMessage(version, channelName);
  await sendSlackReply({ channelName, message, messageId: buildThread?.id });
}

export async function sendPublishCompleteMessage({
  channelName,
  generalChannelName,
  version,
  runId,
  owner,
  repo,
}: {
  channelName: string,
  generalChannelName?: string,
  version: string,
  runId: number,
  owner: string,
  repo: string,
}) {
  const baseMessage = `:partydeploy: *${githubRunLink(`${getGenericVersion(version)} Release is Complete`, runId.toString(), owner, repo)}* :partydeploy:\n
    • ${slackLink("EE Extra Build", `https://github.com/${owner}/metabase-ee-extra/pulls`)} - ${mentionSlackTeam('core-ems')}
    • ${slackLink("Ops Issues", `https://github.com/${owner}/metabase-ops/issues`)} - ${mentionSlackTeam('successengineers')}`;

  const docsMessage = `
    • ${slackLink("Release Notes", `https://github.com/${owner}/${repo}/releases`)} - ${mentionSlackTeam('tech-writers')}
    • ${slackLink("Docs Update", `https://github.com/${owner}/metabase.github.io/pulls`)} - ${mentionSlackTeam('tech-writers')}`;

  const isPatch = version.split('.').length > 3;

  const message = `${baseMessage}${isPatch ? '' : docsMessage}`;

  const buildThread = await getExistingSlackMessage(version, channelName);
  await sendSlackReply({ channelName, message, messageId: buildThread?.id, broadcast: true });

  if (!isPatch && generalChannelName) {
    await sendSlackMessage({
      message: `:partydeploy: *Metabase ${getGenericVersion(version)} has been released!* :partydeploy:\n\nSee the ${slackLink('full release notes here', `https://github.com/${owner}/${repo}/releases`)}.`,
      channelName: generalChannelName,
    });
  }
}

export async function sendFlakeStatusReport({
  channelName, openFlakeInfo, closedFlakeInfo,
}: {
  channelName: string,
  openFlakeInfo: string,
  closedFlakeInfo: string,
}) {
    const blocks = [
      {
        "type": "header",
        "text": {
          "type": "plain_text",
          "text": `:croissant: Flaky Tests Status :croissant:`,
          "emoji": true
        }
      },
    ];

    const attachments = [
      {
        "color": "#46ad1a",
        "blocks": [{
          "type": "section",
          "text": {
            "type": "mrkdwn",
            "text": `:muscle: *Recently Closed Flakes*\n ${closedFlakeInfo}`,
          }
        }],
      },
      {
        "color": "#d9bb34",
        "blocks": [{
          "type": "section",
          "text": {
            "type": "mrkdwn",
            "text": `:clipboard: *Open Flakes*\n ${openFlakeInfo}`,
          }
        }],
      },
    ];

    return slack.chat.postMessage({
      channel: channelName,
      blocks,
      attachments,
      text: `Flaky issue summary`,
    });
}

/**
 * uploading a file to slack is a three step process:
 * 1) make an api call to get a specific url to upload to
 * 2) make an http POST request to that url with the file
 * 3) make an api call to "complete" the upload and post it somewhere in slack
 */
async function uploadFileToSlack({
  channelName,
  thread_ts,
  fileName,
  file,
  message,
}: {
  channelName: string,
  thread_ts?: string,
  fileName: string,
  file: Buffer,
  message: string,
}) {
  console.log(`Uploading file ${fileName} to slack`);

  const uploadRequest = await slack.files.getUploadURLExternal({
    filename: fileName,
    length: file.length,
  });

  if (!uploadRequest.ok || !uploadRequest.upload_url || !uploadRequest.file_id) {
    throw new Error(`Failed to get upload URL: ${uploadRequest.error}`);
  }

  const uploadResult = await fetch(uploadRequest.upload_url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
    },
    body: file,
  });

  if (!uploadResult.ok) {
    throw new Error(`Failed to upload file: ${uploadResult.statusText}`);
  }

  const channelId = await getSlackChannelId(channelName);

  return slack.files.completeUploadExternal({
    files: [{ id: uploadRequest.file_id, title: fileName }],
    channel_id: channelId,
    thread_ts,
    initial_comment: message,
  });
}

const milestoneCheckProjectUrl = 'https://github.com/orgs/metabase/projects/93';

export async function sendMilestoneCheckMessage({
  channelName,
  issueCount,
  version,
}: {
  channelName: string,
  issueCount: number,
  version: string,
}) {
  console.log('Sending milestone check slack message to ', channelName);
  let buildThread = await getExistingSlackMessage(version, channelName);

  // if we can't find a build thread, we'll make our own pre-build thread
  if (!buildThread) {
    const message = `:file_folder: *${getGenericVersion(version)} Pre-release milestone check*`;
    const response = await sendSlackMessage({ channelName, message });
    buildThread = { id: response.ts ?? '', body: message };
  }

  const message = `:mag: ${getGenericVersion(version)} has ${slackLink(`${issueCount} issues that need to be checked`, milestoneCheckProjectUrl)}`;

  await sendSlackReply({ message, channelName, messageId: buildThread.id });

  const fileName = `milestone-audit-${version}.md`;
  const file = fs.readFileSync('./' + fileName);
  const fileMessage = `:page_with_curl: ${getGenericVersion(version)} milestone audit`;

  return uploadFileToSlack({
    channelName,
    thread_ts: buildThread.id,
    fileName,
    file,
    message: fileMessage,
  });
}
