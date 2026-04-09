import { t } from "ttag";

import * as Urls from "metabase/lib/urls";
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
    snippets: {
      description: t`Reusable bits of code that save your time`,
      actionLabel: t`New snippet`,
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
  }
  // "data" section opens a modal, so no actionUrl

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
