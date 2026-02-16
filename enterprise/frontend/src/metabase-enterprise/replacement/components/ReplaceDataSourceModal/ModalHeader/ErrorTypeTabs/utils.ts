import { msgid, ngettext } from "ttag";

import type { DescendantsTabInfo, ErrorTabInfo, TabInfo } from "../../types";

export function getTabLabel(tab: TabInfo): string {
  if (tab.type === "descendants") {
    return getDescendantTabLabel(tab);
  }
  return getErrorTabLabel(tab);
}

function getDescendantTabLabel(tab: DescendantsTabInfo): string {
  const count = tab.nodes.length;
  return ngettext(
    msgid`${count} item will be changed`,
    `${count} items will be changed`,
    count,
  );
}

function getErrorTabLabel(tab: ErrorTabInfo): string {
  const count = tab.error.columns.length;
  switch (tab.type) {
    case "missing-column":
      return ngettext(
        msgid`${count} missing column`,
        `${count} missing columns`,
        count,
      );
    case "column-type-mismatch":
      return ngettext(
        msgid`${count} column type mismatch`,
        `${count} column type mismatches`,
        count,
      );
    case "missing-primary-key":
      return ngettext(
        msgid`${count} missing primary key`,
        `${count} missing primary keys`,
        count,
      );
    case "extra-primary-key":
      return ngettext(
        msgid`${count} extra primary key`,
        `${count} extra primary keys`,
        count,
      );
    case "missing-foreign-key":
      return ngettext(
        msgid`${count} missing foreign key`,
        `${count} missing foreign keys`,
        count,
      );
    case "foreign-key-mismatch":
      return ngettext(
        msgid`${count} foreign key mismatch`,
        `${count} foreign key mismatches`,
        count,
      );
  }
}
