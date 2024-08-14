interface GetRelativeLandingPageUrlResult {
  isSameOrigin: boolean;
  relativeUrl: string;
}

export const getRelativeLandingPageUrl = (
  value: string,
): GetRelativeLandingPageUrlResult => {
  const trimmedValue = value.trim();

  // if user input is an absolute url to an external origin,
  // URL construction will override the default origin provided as second arg
  const url = new URL(trimmedValue, location.origin);
  const isSameOrigin = location.origin === url.origin;

  const relativeUrl =
    isSameOrigin && trimmedValue !== ""
      ? url.pathname + url.search + url.hash
      : "";

  return { isSameOrigin, relativeUrl };
};
