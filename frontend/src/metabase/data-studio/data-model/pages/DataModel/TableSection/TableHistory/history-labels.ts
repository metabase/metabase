import { msgid, ngettext, t } from "ttag";

import type {
  HistoryCheck,
  HistoryCheckId,
  HistoryCheckStatus,
  HistoryProfile,
} from "metabase/metadata/table-structure";
import type { ColorName } from "metabase/ui/colors/types";
import type { IconName, Table } from "metabase-types/api";

export type EntityNoun = { one: string; other: string };

const TABLE_PREFIX_RE = /^(dim_|d_|stg_|int_)/;
const TABLE_SUFFIX_RE = /_(history|snapshots?|versions?|scd\d?)$/;

const ENTITY_KEY_RE = /^(.+)_id$/;

export function getEntityNoun(
  table: Pick<Table, "name">,
  durableKeyName?: string,
): EntityNoun {
  const fromKey = durableKeyName?.toLowerCase().match(ENTITY_KEY_RE)?.[1];
  const fromTable = table.name
    .toLowerCase()
    .replace(TABLE_PREFIX_RE, "")
    .replace(TABLE_SUFFIX_RE, "");
  const base = (fromKey ?? fromTable).replace(/_/g, " ");
  const one = base.endsWith("s") ? base.slice(0, -1) : base;
  return { one, other: `${one}s` };
}

export const countOf = (count: number, noun: EntityNoun) =>
  `${count.toLocaleString()} ${count === 1 ? noun.one : noun.other}`;

export const formatDate = (value: string | null) =>
  value == null ? t`open` : value.slice(0, 10);

export function getCheckTitle(id: HistoryCheckId) {
  const titles: Record<HistoryCheckId, string> = {
    "durable-key": t`The durable key groups versions`,
    "one-current": t`One current version each`,
    overlap: t`Versions don't overlap`,
    gap: t`No gaps between versions`,
    "valid-range": t`Valid to comes after valid from`,
    "has-current": t`Every key has a current version`,
    "version-order": t`Versions are numbered in order`,
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
      : t`Holds for every ${noun.one}`;
  }
  switch (check.id) {
    case "durable-key":
      return profile.entityCount === profile.rowCount
        ? t`Every ${keyName} appears on one row only, so no versions are grouped. It's probably a per-version key.`
        : t`${keyName} is also the version key, so each version looks like its own ${noun.one}.`;
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
        msgid`${subject} has no current version, so it was probably deleted at the source.`,
        `${subject} have no current version, so they were probably deleted at the source.`,
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
