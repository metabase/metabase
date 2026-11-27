import { type LucideIcon, icons } from "lucide-react";

import type { IconName } from "metabase-types/api";

import { iconNames, isValidIconName } from "../icons";

import { LUCIDE_ICON_PICKS } from "./lucideIconPicks";

const STORAGE_KEY = "metabase-lucide-comparison-picks";
const MAX_SEARCH_RESULTS = 48;

/**
 * Picks made in this browser that differ from LUCIDE_ICON_PICKS. A Lucide
 * component name sets a pick; `null` removes a pick that is saved in code.
 */
export type LocalIconPicks = Partial<Record<IconName, string | null>>;

export type PickStatus = "saved" | "unsaved";

export type IconPick = {
  lucideName: string;
  icon: LucideIcon;
  status: PickStatus;
};

let lucideIconsByName: ReadonlyMap<string, LucideIcon> | undefined;

/** Every Lucide icon, keyed by its component name, e.g. "CircleDot". */
export function getLucideIconsByName(): ReadonlyMap<string, LucideIcon> {
  lucideIconsByName ??= new Map(Object.entries(icons));
  return lucideIconsByName;
}

/** Lucide component names matching `query`, best matches first. */
export function searchLucideIcons(query: string): {
  names: string[];
  totalCount: number;
} {
  const normalizedQuery = normalizeName(query);
  if (normalizedQuery === "") {
    return { names: [], totalCount: 0 };
  }
  const matchingNames = Array.from(getLucideIconsByName().keys()).filter(
    (name) => normalizeName(name).includes(normalizedQuery),
  );
  const sortedNames = [
    ...matchingNames.filter((name) =>
      normalizeName(name).startsWith(normalizedQuery),
    ),
    ...matchingNames.filter(
      (name) => !normalizeName(name).startsWith(normalizedQuery),
    ),
  ];
  return {
    names: sortedNames.slice(0, MAX_SEARCH_RESULTS),
    totalCount: matchingNames.length,
  };
}

/** The pick in effect for `name`: this browser's, else the one in code. */
export function getIconPick(
  name: IconName,
  localPicks: LocalIconPicks,
): IconPick | null {
  const savedName = LUCIDE_ICON_PICKS[name];
  const localName = localPicks[name];
  const lucideName = localName === undefined ? savedName : localName;
  const icon =
    lucideName != null ? getLucideIconsByName().get(lucideName) : undefined;

  if (lucideName == null || icon == null) {
    return null;
  }
  return {
    lucideName,
    icon,
    status: lucideName === savedName ? "saved" : "unsaved",
  };
}

/** Picks `lucideName` for `name`, dropping the local entry once it matches code. */
export function setLocalPick(
  localPicks: LocalIconPicks,
  name: IconName,
  lucideName: string | null,
): LocalIconPicks {
  const savedName = LUCIDE_ICON_PICKS[name] ?? null;
  const { [name]: _previous, ...otherPicks } = localPicks;
  return lucideName === savedName
    ? otherPicks
    : { ...otherPicks, [name]: lucideName };
}

export function countUnsavedPicks(localPicks: LocalIconPicks): number {
  return iconNames.filter((name) => {
    const localName = localPicks[name];
    return (
      localName !== undefined && localName !== (LUCIDE_ICON_PICKS[name] ?? null)
    );
  }).length;
}

export function readLocalPicks(): LocalIconPicks {
  try {
    const stored: unknown = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) ?? "{}",
    );
    if (typeof stored !== "object" || stored === null) {
      return {};
    }
    const storedEntries: [string, unknown][] = Object.entries(stored);
    return storedEntries.reduce<LocalIconPicks>(
      (picks, [name, value]) =>
        isValidIconName(name) && isKnownPick(value)
          ? { ...picks, [name]: value }
          : picks,
      {},
    );
  } catch {
    return {};
  }
}

export function writeLocalPicks(localPicks: LocalIconPicks) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(localPicks));
  } catch {
    // Storage can be unavailable, e.g. in a private window; picks then last
    // until the page reloads.
  }
}

/**
 * The full text of lucideIconPicks.ts with this browser's picks applied, ready
 * to paste over the file.
 */
export function buildPicksFileContents(localPicks: LocalIconPicks): string {
  const entries = iconNames.flatMap((name) => {
    const pick = getIconPick(name, localPicks);
    return pick ? [`  ${formatObjectKey(name)}: "${pick.lucideName}",`] : [];
  });

  return `import type { IconName } from "metabase-types/api";

/**
 * Lucide icons picked by hand on the "Lucide comparison" Storybook page.
 * Values are Lucide component names. To update, click "Copy picks file" on
 * that page and paste the result over this file.
 */
export const LUCIDE_ICON_PICKS: Partial<Record<IconName, string>> = {${
    entries.length > 0 ? `\n${entries.join("\n")}\n` : ""
  }};
`;
}

function isKnownPick(value: unknown): value is string | null {
  return (
    value === null ||
    (typeof value === "string" && getLucideIconsByName().has(value))
  );
}

function formatObjectKey(key: string) {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key);
}

function normalizeName(name: string) {
  return name.toLowerCase().replace(/[\s_-]/g, "");
}
