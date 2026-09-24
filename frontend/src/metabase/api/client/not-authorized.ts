const NOT_AUTHORIZED_PAGE_TRIGGERS = [
  /\/api\/dashboard\/\d+$/,
  /\/api\/collection\/\d+(?:\/items)?$/,
  /\/api\/card\/\d+$/,
  /\/api\/pulse\/\d+$/,
];

// If any of these receives a 403, we should display the "not authorized" page.
export function shouldShowNotAuthorizedPage(url: string): boolean {
  return NOT_AUTHORIZED_PAGE_TRIGGERS.some((regex) => regex.test(url));
}
