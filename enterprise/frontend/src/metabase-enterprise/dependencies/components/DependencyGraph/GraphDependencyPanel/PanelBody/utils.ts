import { msgid, ngettext } from "ttag";

export function getNodeViewCountLabel(viewCount: number) {
  return ngettext(msgid`${viewCount} view`, `${viewCount} views`, viewCount);
}
