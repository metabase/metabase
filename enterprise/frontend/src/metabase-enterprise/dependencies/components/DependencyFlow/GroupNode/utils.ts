import { msgid, ngettext } from "ttag";

import type { GroupNodeData } from "../types";

export function getNodeLabel({ type, count }: GroupNodeData) {
  switch (type) {
    case "question":
      return ngettext(msgid`${count} question`, `${count} questions`, count);
    case "model":
      return ngettext(msgid`${count} model`, `${count} models`, count);
    case "metric":
      return ngettext(msgid`${count} metric`, `${count} metrics`, count);
    case "table":
      return ngettext(msgid`${count} table`, `${count} tables`, count);
    case "snippet":
      return ngettext(msgid`${count} snippet`, `${count} snippets`, count);
    case "transform":
      return ngettext(msgid`${count} transform`, `${count} transforms`, count);
  }
}
