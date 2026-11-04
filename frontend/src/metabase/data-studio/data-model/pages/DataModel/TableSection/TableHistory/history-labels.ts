import { msgid, ngettext, t } from "ttag";

import type {
  HistoryCheck,
  HistoryCheckId,
  HistoryCheckStatus,
  HistoryProfile,
} from "metabase/metadata/table-structure";
import type { ColorName } from "metabase/ui/colors/types";
import type { Field, IconName, Table } from "metabase-types/api";

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

export function getCheckTitle(id: HistoryCheckId) {
  const titles: Record<HistoryCheckId, string> = {
    "durable-key": t`The entity key groups versions`,
    "one-current": t`One current version each`,
    overlap: t`Versions don't overlap`,
    gap: t`No gaps between versions`,
    "valid-range": t`Valid to comes after valid from`,
    "has-current": t`Every key has a current version`,
    "version-order": t`Versions are numbered in order`,
    "latest-tie": t`One latest row per key`,
  };
  return titles[id];
}

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

export const CHECK_STATUS_ICON: Record<
  HistoryCheckStatus,
  { name: IconName; color: ColorName }
> = {
  passed: { name: "check_filled", color: "feedback-positive" },
  warning: { name: "warning", color: "feedback-warning" },
  failed: { name: "warning_round_filled", color: "feedback-negative" },
};

export function getCheckScope(
  profile: HistoryProfile,
  table: Pick<Table, "estimated_row_count">,
) {
  if (!profile.isSampled) {
    return t`Checked on all ${profile.rowCount.toLocaleString()} records.`;
  }
  const total = table.estimated_row_count;
  return total != null
    ? t`Checked on a sample of ${profile.rowCount.toLocaleString()} of about ${total.toLocaleString()} records.`
    : t`Checked on a sample of ${profile.rowCount.toLocaleString()} records.`;
}

export function getDataNote(check: HistoryCheck, noun: EntityNoun) {
  const subject = countOf(check.entityKeys.length, noun);
  const count = check.entityKeys.length;
  switch (check.id) {
    case "has-current":
      return ngettext(
        msgid`${subject} has no current record.`,
        `${subject} have no current record.`,
        count,
      );
    case "one-current":
      return ngettext(
        msgid`${subject} has two current records.`,
        `${subject} have two current records.`,
        count,
      );
    case "gap":
      return ngettext(
        msgid`${subject} has a gap in their history.`,
        `${subject} have a gap in their history.`,
        count,
      );
    default:
      return null;
  }
}
