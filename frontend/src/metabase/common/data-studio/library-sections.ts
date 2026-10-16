import { t } from "ttag";

// The `metabase/urls` barrel reaches this file through `urls/collections`,
// so importing it here would be a cycle
import {
  type ExpandedIdsParams,
  dataStudioDashboards,
  dataStudioDocuments,
} from "metabase/urls/data-studio";
import type {
  CollectionItemModel,
  IconName,
  LibraryCollectionType,
  LibrarySubCollectionType,
} from "metabase-types/api";

export type LibrarySection = {
  /** The model the section holds, beside its folders */
  model: CollectionItemModel;
  /** How bulk selection and the move modal refer to the section */
  key: string;
  icon: IconName;
  getName: () => string;
  /** Undefined for Data and Metrics, which share the Semantic layer page */
  getUrl: ((params?: ExpandedIdsParams) => string) | undefined;
};

export const LIBRARY_SECTIONS = {
  "library-data": {
    model: "table",
    key: "data",
    icon: "table",
    getName: () => t`Data`,
    getUrl: undefined,
  },
  "library-metrics": {
    model: "metric",
    key: "metrics",
    icon: "metric",
    getName: () => t`Metrics`,
    getUrl: undefined,
  },
  "library-dashboards": {
    model: "dashboard",
    key: "dashboards",
    icon: "dashboard",
    getName: () => t`Dashboards`,
    getUrl: dataStudioDashboards,
  },
  "library-documents": {
    model: "document",
    key: "documents",
    icon: "document",
    getName: () => t`Documents`,
    getUrl: dataStudioDocuments,
  },
} as const satisfies Record<LibrarySubCollectionType, LibrarySection>;

export type LibrarySectionModel =
  (typeof LIBRARY_SECTIONS)[LibrarySubCollectionType]["model"];

export type LibrarySectionKey =
  (typeof LIBRARY_SECTIONS)[LibrarySubCollectionType]["key"];

export function getLibrarySectionName(type: LibraryCollectionType): string {
  return type === "library"
    ? t`Semantic layer`
    : LIBRARY_SECTIONS[type].getName();
}
