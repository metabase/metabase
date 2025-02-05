import fs from 'fs';

import { $ } from 'zx';

const releaseChannels = [
  "nightly",
  "beta",
  "latest",
] as const;

const editions = ["oss", "ee"] as const;

type CommitInfo = {
  version: string,
  message: string,
  hash: string,
  date: string,
}

type ReleaseChannel = typeof releaseChannels[number];
type Edition = typeof editions[number];
type ChannelInfo = Record<Edition, CommitInfo & { edition: Edition, channel: ReleaseChannel }>;
type TagInfo = Record<ReleaseChannel, ChannelInfo>;

const tablePageTemplate = fs.readFileSync('./src/releaseChannelPageTemplate.html', 'utf8');
const format = "--pretty='format:%(decorate:prefix=,suffix=)||%s||%H||%ah'";

export async function gitLog(channel: ReleaseChannel, edition: Edition): Promise<CommitInfo> {
  const { stdout } = await $`git log -1 ${format} refs/tags/${channel}-${edition}`.catch(() => ({ stdout: '' }));
  const commitInfo = processCommit(stdout.trim());

  return commitInfo;
}

function processCommit(commitLine: string): CommitInfo {
  const [refs, message, hash, date] = commitLine.split('||');

  // match version strings that don't have an x in them
  // https://regexr.com/8a5kb
  const version = refs?.match(/(v(0|1)\.[\d\.\-(RC|beta|alpha)]+)(?!.*x)/i)?.[1] ?? '';

  return { version, message, hash, date};
}

const commitLink = (hash: string) => `https://github.com/metabase/metabase/commit/${hash}`;

function linkifyCommit(commit: CommitInfo) {
  return `<a href="${commitLink(commit.hash)}" target="_blank">${commit.version}</a>`;
}

function tableRow(channelInfo: ChannelInfo) {
  return `<tr>
    <td><strong>${channelInfo.ee.channel}</strong></td>
    <td>${linkifyCommit(channelInfo.oss)}</td>
    <td>${linkifyCommit(channelInfo.ee)}</td>
  </tr>`;
}

function buildTable(tagInfo: TagInfo) {
  const rows = Object.values(tagInfo).map(tableRow).join('\n');
  const currentTime = new Date().toLocaleString();
  const tableHtml = `
    <table>
      <thead>
        <tr>
          <th>Channel</th>
          <th>OSS</th>
          <th>EE</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>`;

  return tablePageTemplate
    .replace(/{{release-table}}/, tableHtml)
    .replace(/{{current-time}}/, currentTime);
}

export async function releaseChannelLog() {
  // @ts-expect-error - TS is too stupid to infer from Object.fromEntries
  const tagInfo: TagInfo = Object.fromEntries(releaseChannels.map((
    channel: ReleaseChannel) => [channel, { ee: {}, oss: {} }]
  ));

  for (const edition of editions) {
    for (const channel of releaseChannels) {
      const commitInfo = await gitLog(channel, edition);
      tagInfo[channel][edition] = {
        channel,
        edition,
        ...commitInfo,
      };
    }
  }

  return buildTable(tagInfo);
}

console.log(await releaseChannelLog());
