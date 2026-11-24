import { useMemo } from "react";

import {
  REMEMBERED_SKELETON_KEY_PREFIX,
  toSkeletonFiller,
} from "metabase/common/components/Skeletons/remembered-skeletons";
import { isHeadingDashCard, isTextDashCard } from "metabase/dashboard/utils";
import type {
  CardDisplayType,
  Dashboard,
  DashboardCard,
  DashboardId,
  Parameter,
} from "metabase-types/api";
import { isCardDisplayType } from "metabase-types/api";

/*
 * PROTOTYPE: a dashboard's layout as last shown, kept in localStorage so its
 * loading skeleton can draw the real layout on any later visit, including
 * after a reload. It keeps layout, never content: every title, name and line
 * of text is stored as filler of the same length and letter case.
 *
 * Skullet's own remembered shapes can't do this for dashboards: it stores the
 * content's whole markup, and gives up on anything over 20,000 characters,
 * which nearly every dashboard is once its charts render.
 */

type SketchCardPlacement = {
  col: number;
  row: number;
  size_x: number;
  size_y: number;
};

export type DashboardSketchCard = SketchCardPlacement &
  (
    | { kind: "chart"; display: CardDisplayType | undefined; title: string }
    | { kind: "text"; isHeading: boolean; lines: string[] }
  );

export type DashboardSketchParameter = {
  id: string;
  slug: string;
  name: string;
};

export type DashboardSketch = {
  title: string;
  isFixedWidth: boolean;
  hasLastEditInfo: boolean;
  tabs: { id: number; name: string }[];
  /** The filters in the dashboard header, excluding inline ones. */
  parameters: DashboardSketchParameter[];
  /** Cards per tab id, under `NO_TAB` for a dashboard without tabs. */
  cardsByTab: Record<string, DashboardSketchCard[]>;
};

const STORAGE_KEY = `${REMEMBERED_SKELETON_KEY_PREFIX}dashboards`;
const MAX_SKETCHES = 50;
const MAX_TEXT_LINES = 12;
const MAX_TEXT_LINE_CHARS = 40;
const NO_TAB = "none";

const getTabKey = (tabId: number | null | undefined) =>
  tabId == null ? NO_TAB : String(tabId);

const getSketchCard = (dashcard: DashboardCard): DashboardSketchCard => {
  const placement = {
    col: dashcard.col,
    row: dashcard.row,
    size_x: dashcard.size_x,
    size_y: dashcard.size_y,
  };

  if (isHeadingDashCard(dashcard) || isTextDashCard(dashcard)) {
    return {
      ...placement,
      kind: "text",
      isHeading: isHeadingDashCard(dashcard),
      lines: (dashcard.visualization_settings.text ?? "")
        .split("\n")
        .slice(0, MAX_TEXT_LINES)
        .map((line) =>
          toSkeletonFiller(line.trim().slice(0, MAX_TEXT_LINE_CHARS)),
        ),
    };
  }

  const title =
    dashcard.visualization_settings?.["card.title"] ?? dashcard.card?.name;
  return {
    ...placement,
    kind: "chart",
    display: isCardDisplayType(dashcard.card?.display)
      ? dashcard.card.display
      : undefined,
    title: toSkeletonFiller(typeof title === "string" ? title : ""),
  };
};

const readSketches = (): Record<string, DashboardSketch> => {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
};

export const loadDashboardSketch = (
  dashboardId: DashboardId | null,
): DashboardSketch | null =>
  dashboardId == null ? null : (readSketches()[String(dashboardId)] ?? null);

/**
 * Remembers the dashboard as shown: its header, filters and the cards of the
 * tab on screen. Other tabs keep the cards they had when last shown.
 */
export const saveDashboardSketch = ({
  dashboard,
  selectedTabId,
  tabDashcards,
  headerParameters,
}: {
  dashboard: Pick<Dashboard, "id" | "name" | "width" | "last-edit-info"> & {
    tabs?: { id: number; name: string; isRemoved?: boolean }[];
  };
  selectedTabId: number | null;
  tabDashcards: DashboardCard[];
  headerParameters: Parameter[];
}) => {
  const sketches = readSketches();
  const key = String(dashboard.id);
  const previous = sketches[key];

  const sketch: DashboardSketch = {
    title: toSkeletonFiller(dashboard.name),
    isFixedWidth: (dashboard.width ?? "fixed") === "fixed",
    hasLastEditInfo: dashboard["last-edit-info"] != null,
    tabs: (dashboard.tabs ?? [])
      .filter((tab) => !tab.isRemoved)
      .map((tab) => ({ id: tab.id, name: toSkeletonFiller(tab.name) })),
    parameters: headerParameters.map((parameter) => ({
      id: parameter.id,
      slug: parameter.slug,
      name: toSkeletonFiller(parameter.name),
    })),
    cardsByTab: {
      ...previous?.cardsByTab,
      [getTabKey(selectedTabId)]: tabDashcards.map(getSketchCard),
    },
  };

  // Most recently shown last, so the oldest are the first to go
  delete sketches[key];
  sketches[key] = sketch;
  const keys = Object.keys(sketches);
  for (const staleKey of keys.slice(0, keys.length - MAX_SKETCHES)) {
    delete sketches[staleKey];
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sketches));
  } catch {
    // Storage full or unavailable: the next load draws the generic skeleton
  }
};

/**
 * The cards of the tab the dashboard will open on: the URL's `tab` when the
 * sketch has it, else the first tab, as `getInitialSelectedTabId` picks.
 */
export const getSketchLandingCards = (
  sketch: DashboardSketch,
): DashboardSketchCard[] => {
  const tabParam = new URLSearchParams(window.location.search).get("tab");
  const urlTabId = tabParam ? parseInt(tabParam, 10) : null;
  const tabId = sketch.tabs.some((tab) => tab.id === urlTabId)
    ? urlTabId
    : (sketch.tabs[0]?.id ?? null);
  return sketch.cardsByTab[getTabKey(tabId)] ?? [];
};

/** The sketch of the dashboard as last shown, read once per dashboard. */
export const useDashboardSketch = (dashboardId: DashboardId | null) =>
  useMemo(() => loadDashboardSketch(dashboardId), [dashboardId]);
