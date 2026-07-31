import { getUrlParts } from "embedding-sdk-shared/lib/get-url-parts";

export const getUrlPathname = (url: string | undefined) =>
  getUrlParts(url).pathname;
