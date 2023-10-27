import { WebClient } from "@slack/web-api";
import { getGenericVersion } from "./version-helpers";
import { findMilestone } from "./github";
import type { ReleaseProps } from "./types";

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

const SLACK_CHANNEL_NAME = process.env.SLACK_RELEASE_CHANNEL ?? "bot-testing";

type BuildStage =
  | "build-start"
  | "build-done"
  | "test-start"
  | "test-done"
  | "publish-start"
  | "publish-done";

function sendSlackMessage(message: string) {
  return slack.chat.postMessage({
    channel: SLACK_CHANNEL_NAME,
    text: message,
  });
}

async function updateSlackMessage(message: string, messageId: string) {
  const channelId = await getSlackChannelId(SLACK_CHANNEL_NAME);
  if (!channelId) {
    throw new Error(`Could not find channel ${SLACK_CHANNEL_NAME}`);
  }
  return slack.chat.update({
    channel: channelId,
    text: message,
    ts: messageId,
  });
}

async function sendSlackReply(message: string, messageId: string) {
  const channelId = await getSlackChannelId(SLACK_CHANNEL_NAME);
  if (!channelId) {
    throw new Error(`Could not find channel ${SLACK_CHANNEL_NAME}`);
  }

  return slack.chat.postMessage({
    channel: channelId,
    text: message,
    thread_ts: messageId,
  });
}

async function getSlackChannelId(channelName: string) {
  const response = await slack.conversations.list({
    limit: 9999,
    exclude_archived: true,
  });
  return response.channels?.find((channel) => channel.name === channelName)?.id;
}

async function getExistingSlackMessage(version: string) {
  const channelId = await getSlackChannelId(SLACK_CHANNEL_NAME);
  if (!channelId) {
    throw new Error(`Could not find channel ${SLACK_CHANNEL_NAME}`);
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
  return '>' + slackLink(
    text,
    `https://github.com/${owner}/${repo}/actions/runs/${runId}`,
  );
}

async function getReleaseMessage({
  github,
  version,
  owner,
  stage,
  repo,
  previousMessage,
  runId = "",
  releaseSha,
}: ReleaseProps & {
  stage: BuildStage;
  previousMessage?: { body: string, id: string } | null;
  runId?: string;
  releaseSha: string;
}) {
  const title = getReleaseTitle(version);
  const space = "\n";

  const stageMessagesText: Record<BuildStage, string> = {
    "build-start": ":loading: Building",
    "build-done": ":white_check_mark: Build Complete",
    "test-start": ":loading: Testing",
    "test-done": `:white_check_mark: Tests Complete`,
    "publish-start": ":loading: Publishing",
    "publish-done": ":white_check_mark: Publish Complete",
  };

  if (stage === "build-start") {
    const preReleaseMessage = await getPreReleaseInfo({
      version,
      github,
      owner,
      repo,
      releaseSha,
    });

    return [
      title,
      preReleaseMessage,
      githubRunLink(stageMessagesText["build-start"], runId, owner, repo),
    ].join(space);
  }

  if (!previousMessage) {
    return `:warning: Something went wrong`;
  }

  switch (stage) {
    case "build-done":
      return previousMessage.body.replace(
        stageMessagesText["build-start"],
        stageMessagesText["build-done"],
      );
    case "test-start":
      return [
        previousMessage.body,
        githubRunLink(stageMessagesText["test-start"], runId, owner, repo),
      ].join(space);
    case "test-done": {
      const publishReminder = `${slackLink(
        ":rocket: Ready to Publish",
        `https://github.com/${owner}/${repo}/actions/workflows/release.yml`,
      )}`;

      // we want to make sure we send a new message so someone can get pinged when they need to act
      await sendSlackReply(
        `:white_check_mark: Tests are complete\n${publishReminder}`,
        previousMessage.id,
      );

      return previousMessage.body.replace(
        stageMessagesText["test-start"],
        stageMessagesText["test-done"],
      );
    }
    case "publish-start":
      return [
        previousMessage.body,
        githubRunLink(stageMessagesText["publish-start"], runId, owner, repo),
      ].join(space);
    case "publish-done":
      return previousMessage.body.replace(
        stageMessagesText["publish-start"],
        stageMessagesText["publish-done"],
      );
  }
}

export async function sendReleaseMessage({
  github,
  owner,
  repo,
  releaseSha,
  stage,
  version,
  runId,
}: ReleaseProps & {
  stage: BuildStage;
  version: string;
  runId?: string;
  releaseSha: string;
}) {
  const existingMessage = await getExistingSlackMessage(version);

  const message = await getReleaseMessage({
    github,
    version,
    owner,
    stage,
    repo,
    releaseSha,
    previousMessage: existingMessage,
    runId,
  });

  if (existingMessage?.id) {
    return updateSlackMessage(message, existingMessage.id);
  }

  return sendSlackMessage(message);
}

async function getPreReleaseInfo({
  version,
  github,
  owner,
  repo,
  releaseSha,
}: ReleaseProps & {
  releaseSha: string;
}) {
  const milestoneId = await findMilestone({ version, github, owner, repo });
  const milestoneLink = milestoneId
    ? slackLink(
        `_:rock: Milestone_`,
        `https://github.com/${owner}/${repo}/milestone/${milestoneId}?closed=1`,
      )
    : "";

  const releaseCommitLink = slackLink(
    `_:merged: Release Commit_`,
    `https://github.com/${owner}/${repo}/commit/${releaseSha}`,
  );

  return [milestoneLink, releaseCommitLink].filter(Boolean).join(" - ");
}
