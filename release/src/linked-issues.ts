export function getLinkedIssues(body: string) {
  const matches = body.match(
    /(close(s|d)?|fixe?(s|d)?|resolve(s|d)?) (#|https?:\/\/github.com\/.+\/issues\/)(\d+)/gi,
  );

  if (matches) {
    return matches.map(m => {
      const numberMatch = m.match(/\d+/);
      return numberMatch ? numberMatch[0] : null;
    });
  }

  return null;
}

export function getPRsFromCommitMessage(message: string) {
  const result = [ ...message.matchAll(/\(#(\d+)\)/g) ];
  if (!result.length) {
    console.log('no pr found in commit message', message);
    return null;
  }

  return result.map(r => Number(r[1]));
}
