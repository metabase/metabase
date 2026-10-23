export function getQuestionReturnUrl(search: string): string | null {
  const returnTo = new URLSearchParams(search).get("returnTo");
  return returnTo?.startsWith("/question#") ? returnTo : null;
}

export function withQuestionReturnUrl(url: string, returnTo: string): string {
  const hashIndex = url.indexOf("#");
  const pathname = hashIndex < 0 ? url : url.slice(0, hashIndex);
  const hash = hashIndex < 0 ? "" : url.slice(hashIndex);
  return `${pathname}?${new URLSearchParams({ returnTo })}${hash}`;
}
