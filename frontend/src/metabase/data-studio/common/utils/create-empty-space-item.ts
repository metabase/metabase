import { t } from "ttag";

import * as Urls from "metabase/urls";
import type { CollectionId } from "metabase-types/api";

import type { LibrarySectionType, TreeItem } from "../types";

type EmptyStateConfig = {
  description: string;
  actionLabel: string;
};

const getEmptyStateConfig = (
  sectionType: LibrarySectionType,
): EmptyStateConfig => {
  const config: Record<LibrarySectionType, EmptyStateConfig> = {
    data: {
      description: t`Cleaned, pre-transformed data sources ready for exploring`,
      actionLabel: t`Publish a table`,
    },
    metrics: {
      description: t`Standardized calculations with known dimensions`,
      actionLabel: t`New metric`,
    },
    snippets: {
      description: t`Reusable bits of code that save your time`,
      actionLabel: t`New snippet`,
    },
    actions: {
      description: t`Queries that change data`,
      actionLabel: t`New action`,
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
  // The "data" section opens a modal, so no actionUrl

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
