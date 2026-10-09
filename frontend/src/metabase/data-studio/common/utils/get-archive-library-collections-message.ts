import { msgid, ngettext } from "ttag";

export function getArchiveLibraryCollectionsMessage(count: number): string {
  return ngettext(
    msgid`Archiving this collection will also unpublish the tables inside it (and any tables that depend on them) and archive any other child items.`,
    `Archiving these collections will also unpublish the tables inside them (and any tables that depend on them) and archive any other child items.`,
    count,
  );
}
