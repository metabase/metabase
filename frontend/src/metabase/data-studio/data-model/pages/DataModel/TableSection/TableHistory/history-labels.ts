import { msgid, ngettext, t } from "ttag";

import type {
  HistoryCheck,
  HistoryProfile,
} from "metabase/metadata/table-structure";
import type { Field } from "metabase-types/api";

export type EntityNoun = { one: string; other: string };

export function getEntityNoun(
  keyField?: Pick<Field, "display_name"> | null,
): EntityNoun {
  const one = keyField?.display_name ?? t`key`;
  const other = one.endsWith("s") ? one : `${one}s`;
  return { one, other };
}

export const countOf = (count: number, noun: EntityNoun) =>
  `${count.toLocaleString()} ${count === 1 ? noun.one : noun.other}`;

export const formatDate = (value: string | null) =>
  value == null ? t`open` : value.slice(0, 10);

export function getCheckDescription(
  check: HistoryCheck,
  profile: HistoryProfile,
  noun: EntityNoun,
) {
  const keyName = profile.durableKeyField.display_name;
  const count = check.entityKeys.length;
  const subject = countOf(count, noun);
  if (check.status === "passed") {
    return check.id === "durable-key"
      ? t`${countOf(profile.entityCount, noun)}, with up to ${profile.maxVersionCount} versions each`
      : t`No problems in the checked rows`;
  }
  switch (check.id) {
    case "durable-key":
      return profile.entityCount === profile.rowCount
        ? t`Every ${keyName} appears on one row only, so no versions are grouped. It's probably a per-version key.`
        : t`${keyName} is also the version, so each version looks like a separate key.`;
    case "one-current":
      return ngettext(
        msgid`${subject} has more than one current version.`,
        `${subject} have more than one current version.`,
        count,
      );
    case "overlap":
      return ngettext(
        msgid`${subject} has versions whose dates overlap.`,
        `${subject} have versions whose dates overlap.`,
        count,
      );
    case "gap":
      return ngettext(
        msgid`${subject} has a gap between two versions.`,
        `${subject} have a gap between two versions.`,
        count,
      );
    case "valid-range":
      return ngettext(
        msgid`${subject} has a version that ends before it starts.`,
        `${subject} have a version that ends before it starts.`,
        count,
      );
    case "version-order":
      return ngettext(
        msgid`${subject} has a version number that goes down over time.`,
        `${subject} have a version number that goes down over time.`,
        count,
      );
    case "has-current":
      return ngettext(
        msgid`${subject} has no current version, probably removed at the source.`,
        `${subject} have no current version, probably removed at the source.`,
        count,
      );
    case "latest-tie":
      return ngettext(
        msgid`${subject} has two latest rows with the same time, so which one is current isn't decided.`,
        `${subject} have two latest rows with the same time, so which one is current isn't decided.`,
        count,
      );
  }
}
