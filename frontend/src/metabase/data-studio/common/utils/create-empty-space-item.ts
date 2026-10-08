import { t } from "ttag";

import * as Urls from "metabase/urls";
import type { CollectionId } from "metabase-types/api";

import type { LibrarySectionType, TreeItem } from "../types";

type EmptyStateConfig = {
  sectionType: LibrarySectionType;
  description: string;
  actionLabel: string;
  actionUrl?: string;
};

const getEmptyStateConfig = (
  sectionType: LibrarySectionType,
): Omit<EmptyStateConfig, "sectionType" | "actionUrl"> => {
  const config: Record<
    LibrarySectionType,
    Omit<EmptyStateConfig, "sectionType" | "actionUrl">
  > = {
    data: {
      description: t`Cleaned, pre-transformed data sources ready for exploring`,
      actionLabel: t`Publish a table`,
    },
    metrics: {
      description: t`Standardized calculations with known dimensions`,
      actionLabel: t`New metric`,
    },
    dashboards: {
      description: t`Curated dashboards built on the semantic layer`,
      actionLabel: t`Create a dashboard`,
    },
    snippets: {
      description: t`Reusable bits of code that save your time`,
      actionLabel: t`New snippet`,
    },
    actions: {
      description: t`Queries that change data, for data apps to run`,
      actionLabel: t`New data action`,
    },
  };

  return config[sectionType];
};

export const createEmptyStateItem = (
  sectionType: LibrarySectionType,
  collectionId?: CollectionId,
  hideAction?: boolean,
): TreeItem => {
  const config = getEmptyStateConfig(sectionType);

  let actionUrl: string | undefined;
  if (sectionType === "metrics" && collectionId && !hideAction) {
    actionUrl = Urls.newDataStudioMetric({ collectionId: collectionId });
  } else if (sectionType === "snippets" && !hideAction) {
    actionUrl = Urls.newDataStudioSnippet();
  } else if (sectionType === "actions" && !hideAction) {
    actionUrl = Urls.newDataStudioAction();
  }
  // "data" and "dashboards" sections open a modal, so no actionUrl

  return {
    id: `empty-state:${sectionType}`,
    name: "",
    icon: "empty",
    model: "empty-state",
    data: {
      model: "empty-state",
      sectionType,
      description: config.description,
      actionLabel: config.actionLabel,
      actionUrl,
    },
  };
};
