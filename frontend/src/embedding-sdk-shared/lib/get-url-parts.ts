export const getUrlParts = (url: string | undefined) => {
  const [pathname = "", query = ""] = url?.split("?") ?? [];

  return { pathname, query };
};
