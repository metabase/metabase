// Pure core of the changed-files gate: parse `.github/file-paths.yaml` into
// rules and decide which filters a set of changed files matches.
//
// Mirrors dorny/paths-filter's matching semantics so the two can be compared
// answer-for-answer:
//   - a filter is a list of entries; an entry is either a glob string or a
//     `<change-type>: <glob>` map, where change types are `|`-separated
//   - YAML anchors expand to nested lists, which are flattened
//   - globs go through picomatch (via micromatch) with `dot: true`
//   - a file matches a filter when at least one of the filter's rules matches
//     (dorny's default `predicate-quantifier: some`)

import { load } from "js-yaml";
import micromatch from "micromatch";

export const CHANGE_STATUSES = [
  "added",
  "copied",
  "deleted",
  "modified",
  "renamed",
  "unknown",
] as const;

export type ChangeStatus = (typeof CHANGE_STATUSES)[number];

export type ChangedFile = { filename: string; status: ChangeStatus };

// `statuses: null` accepts any change type.
export type FilterRule = { glob: string; statuses: ChangeStatus[] | null };

export type FilterSet = Record<string, FilterRule[]>;

// Either a concrete diff, or "the diff could not be established, so assume
// everything changed". Every failure path resolves to the latter: a false skip
// drops a suite silently and still reports the commit green, which is the
// failure class this gate exists to prevent. Wasted runner minutes are the
// cheaper mistake.
export type ChangeSet =
  | { kind: "files"; files: ChangedFile[] }
  | { kind: "all"; reason: string };

// In the `all` case there is no diff to report, so there are no per-filter file
// lists. Callers must handle that explicitly rather than reading an empty list
// as "nothing changed" — downstream consumers of `*_files` narrow their work
// from it, so an empty list there would reintroduce the false skip.
export type FilterResult =
  | { kind: "files"; matched: string[]; files: Record<string, ChangedFile[]> }
  | { kind: "all"; matched: string[]; reason: string };

const isChangeStatus = (value: string): value is ChangeStatus =>
  (CHANGE_STATUSES as readonly string[]).includes(value);

// `frontend_all` nests anchors three deep, so entries are flattened before any
// leaf is read as a rule.
function flatten(value: unknown): unknown[] {
  return Array.isArray(value) ? value.flatMap(flatten) : [value];
}

function parseStatuses(spec: string, filterName: string): ChangeStatus[] {
  const statuses = spec.split("|").map((part) => part.trim().toLowerCase());
  const unrecognised = statuses.filter((status) => !isChangeStatus(status));
  if (unrecognised.length > 0) {
    throw new Error(
      `Filter "${filterName}": unknown change type(s) ${unrecognised.join(", ")} in "${spec}"`,
    );
  }
  return statuses as ChangeStatus[];
}

function parseEntry(entry: unknown, filterName: string): FilterRule[] {
  if (typeof entry === "string") {
    return [{ glob: entry, statuses: null }];
  }

  if (entry !== null && typeof entry === "object" && !Array.isArray(entry)) {
    return Object.entries(entry).flatMap(([spec, globs]) => {
      const statuses = parseStatuses(spec, filterName);
      return flatten(globs).map((glob) => {
        if (typeof glob !== "string") {
          throw new Error(
            `Filter "${filterName}": expected a glob string under "${spec}", got ${JSON.stringify(glob)}`,
          );
        }
        return { glob, statuses };
      });
    });
  }

  throw new Error(
    `Filter "${filterName}": unsupported entry ${JSON.stringify(entry)}`,
  );
}

export function parseFilters(yamlText: string): FilterSet {
  const document = load(yamlText);

  if (
    document === null ||
    typeof document !== "object" ||
    Array.isArray(document)
  ) {
    throw new Error(
      "Filter file must be a mapping of filter name to a list of rules",
    );
  }

  return Object.fromEntries(
    Object.entries(document).map(([name, entries]) => [
      name,
      flatten(entries).flatMap((entry) => parseEntry(entry, name)),
    ]),
  );
}

const ruleMatches = (rule: FilterRule, file: ChangedFile) =>
  (rule.statuses === null || rule.statuses.includes(file.status)) &&
  micromatch.isMatch(file.filename, rule.glob, { dot: true });

export function matchFilters(
  filters: FilterSet,
  changes: ChangeSet,
): FilterResult {
  const names = Object.keys(filters);

  if (changes.kind === "all") {
    return { kind: "all", matched: names, reason: changes.reason };
  }

  // Every declared filter gets an entry, so callers can emit `false` for the
  // ones that did not fire rather than only reporting the ones that did.
  const files = Object.fromEntries(
    names.map((name) => [
      name,
      changes.files.filter((file) =>
        filters[name].some((rule) => ruleMatches(rule, file)),
      ),
    ]),
  );

  return {
    kind: "files",
    matched: names.filter((name) => files[name].length > 0),
    files,
  };
}
