export const login = (redirectUrl?: string) => {
  return redirectUrl
    ? `/auth/login?redirect=${encodeURIComponent(redirectUrl)}`
    : "/auth/login";
};

export const password = (redirectUrl?: string) => {
  return redirectUrl
    ? `/auth/login/password?redirect=${encodeURIComponent(redirectUrl)}`
    : `/auth/login/password`;
};
