import { WebClient } from '@slack/web-api';
import type { Issue } from './types';

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

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
