import { t } from "ttag";

import type { IconModel } from "metabase/common/utils/icon";
import * as Urls from "metabase/urls";
import {
  isQuestionDashCard,
  isVirtualDashCard,
} from "metabase/utils/dashboard";
import type {
  Collection,
  CollectionId,
  Dashboard,
  DashboardTabId,
  IconName,
  ListDashboardsResponse,
  VisualizationDisplay,
} from "metabase-types/api";

export type LibraryDashboard = ListDashboardsResponse[number];

export type DashboardTreeNode = {
  id: string;
  name: string;
  icon: IconName;
  updatedAt?: string;
  parent: Collection;
} & (
  | {
      model: "collection";
      collection: Collection;
      children: DashboardTreeNode[];
    }
  | {
      model: "dashboard";
      dashboard: LibraryDashboard;
      children?: undefined;
    }
);

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name);

export function getCollectionNodeId(collectionId: CollectionId) {
  return `collection:${collectionId}`;
}

export function getSubtreeCollectionIds(collection: Collection): Set<number> {
  const ids = new Set<number>();
  const visit = (c: Collection) => {
    if (typeof c.id === "number") {
      ids.add(c.id);
    }
    c.children?.forEach(visit);
  };
  visit(collection);
  return ids;
}

export function buildDashboardTree(
  collection: Collection,
  dashboardsByCollectionId: Map<CollectionId, LibraryDashboard[]>,
): DashboardTreeNode[] {
  const folders: DashboardTreeNode[] = (collection.children ?? [])
    .filter((child) => !child.archived)
    .sort(byName)
    .map((child) => ({
      id: getCollectionNodeId(child.id),
      name: child.name,
      icon: "folder",
      parent: collection,
      model: "collection",
      collection: child,
      children: buildDashboardTree(child, dashboardsByCollectionId),
    }));

  const dashboards: DashboardTreeNode[] = [
    ...(dashboardsByCollectionId.get(collection.id) ?? []),
  ]
    .sort(byName)
    .map((dashboard) => ({
      id: `dashboard:${dashboard.id}`,
      name: dashboard.name,
      icon: "dashboard",
      updatedAt: dashboard.updated_at,
      parent: collection,
      model: "dashboard",
      dashboard,
    }));

  return [...folders, ...dashboards];
}

export function groupDashboardsByCollectionId(
  dashboards: LibraryDashboard[],
  collectionIds: Set<number>,
) {
  const map = new Map<CollectionId, LibraryDashboard[]>();
  dashboards.forEach((dashboard) => {
    const collectionId = dashboard.collection_id;
    if (
      dashboard.archived ||
      typeof collectionId !== "number" ||
      !collectionIds.has(collectionId)
    ) {
      return;
    }
    map.set(collectionId, [...(map.get(collectionId) ?? []), dashboard]);
  });
  return map;
}

export type DashboardContentItem = {
  id: string;
  entityId: number;
  name: string;
  model: IconModel;
  display?: VisualizationDisplay;
  typeLabel: string;
  tabNames: string[];
  url: string;
};

const CARD_TYPE_TO_MODEL = {
  question: "card",
  model: "dataset",
  metric: "metric",
} as const;

function getTypeLabel(model: string): string {
  switch (model) {
    case "card":
      return t`Question`;
    case "dataset":
      return t`Model`;
    case "metric":
      return t`Metric`;
    case "dashboard":
      return t`Dashboard`;
    case "collection":
      return t`Collection`;
    case "table":
      return t`Table`;
    case "document":
      return t`Document`;
    default:
      return model;
  }
}

/**
 * The saved entities a dashboard shows: the questions behind its cards
 * (including combined series) and the entities its link cards point to.
 * Each entity is listed once, with every tab it appears on.
 */
export function getDashboardContents(
  dashboard: Dashboard,
): DashboardContentItem[] {
  const tabNameById = new Map(
    (dashboard.tabs ?? []).map((tab) => [tab.id, tab.name]),
  );
  const items = new Map<string, DashboardContentItem>();

  const addItem = (
    entity: Omit<DashboardContentItem, "id" | "typeLabel" | "tabNames">,
    tabId: DashboardTabId | null | undefined,
  ) => {
    const id = `${entity.model}:${entity.entityId}`;
    const tabName = tabId != null ? tabNameById.get(tabId) : undefined;
    const existing = items.get(id);
    if (existing) {
      if (tabName && !existing.tabNames.includes(tabName)) {
        existing.tabNames.push(tabName);
      }
      return;
    }
    items.set(id, {
      id,
      entityId: entity.entityId,
      name: entity.name,
      model: entity.model,
      display: entity.display,
      url: entity.url,
      typeLabel: getTypeLabel(entity.model),
      tabNames: tabName ? [tabName] : [],
    });
  };

  dashboard.dashcards.forEach((dashcard) => {
    if (isQuestionDashCard(dashcard)) {
      [dashcard.card, ...(dashcard.series ?? [])].forEach((card) => {
        const model = CARD_TYPE_TO_MODEL[card.type];
        addItem(
          {
            entityId: card.id,
            name: card.name,
            model,
            display: card.display,
            url: Urls.modelToUrl({ id: card.id, model, name: card.name }),
          },
          dashcard.dashboard_tab_id,
        );
      });
    } else if (isVirtualDashCard(dashcard)) {
      const entity = dashcard.visualization_settings.link?.entity;
      if (entity && !("restricted" in entity)) {
        addItem(
          {
            entityId: entity.id,
            name: entity.display_name ?? entity.name,
            model: entity.model,
            display: entity.display,
            url: Urls.modelToUrl(entity),
          },
          dashcard.dashboard_tab_id,
        );
      }
    }
  });

  return [...items.values()].sort(byName);
}
