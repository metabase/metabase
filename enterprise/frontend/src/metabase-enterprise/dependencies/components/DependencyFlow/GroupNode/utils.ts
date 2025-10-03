import { msgid, ngettext } from "ttag";

import type { DependencyGroup } from "../types";

export function getNodeLabel({ type, count }: DependencyGroup) {
  switch (type) {
    case "card":
      return ngettext(msgid`${count} card`, `${count} cards`, count);
    case "table":
      return ngettext(
        msgid`${count} table uses this`,
        `${count} tables`,
        count,
      );
    case "snippet":
      return ngettext(
        msgid`${count} snippet uses this`,
        `${count} snippets`,
        count,
      );
    case "transform":
      return ngettext(
        msgid`${count} transform uses this`,
        `${count} transforms`,
        count,
      );
  }
}
