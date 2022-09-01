import slugg from "slugg";

import { Bookmark } from "metabase-types/api";

import { appendSlug } from "./utils";

export function bookmark({ id, type, name }: Bookmark) {
  const [, idInteger] = id.split("-");
  return `/${type}/${appendSlug(idInteger, slugg(name))}`;
}
