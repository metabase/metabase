export const login = (redirectUrl?: string) => {
  return redirectUrl
    ? `/auth/login?redirect=${encodeURIComponent(redirectUrl)}`
    : "/auth/login";
};
