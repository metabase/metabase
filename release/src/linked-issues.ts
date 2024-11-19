export function getLinkedIssues(body: string) {
  const matches = body.match(
    /(close(s|d)?|fixe?(s|d)?|resolve(s|d)?)(:?) (#|https?:\/\/github.com\/.+\/issues\/)(\d+)/gi,
  );

  if (matches) {
    return matches.map(m => {
      const numberMatch = m.match(/\d+/);
      return numberMatch ? numberMatch[0] : null;
    });
  }

  return null;
}

export const issueNumberRegex = /\(#(\d+)\)/g

export function getPRsFromCommitMessage(message: string) {
  const firstLine = message.split('\n\n')[0];
  const result = [ ...firstLine.matchAll(issueNumberRegex) ];
  if (!result.length) {
    console.log('No pr found in commit message', message);
    return null;
  }

  return result.map(r => Number(r[1]));
}

// backport PRs just have a pr number in the body without a keyword
export function getBackportSourcePRNumber(body: string) {
  const matches = body.match(/#(\d+)/);
  return matches ? Number(matches[1]) : null;
}
