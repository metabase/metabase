import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { searchApi } from "metabase/api";
import { getCollectionIcon } from "metabase/common/collections/utils";
import { useDispatch } from "metabase/redux";
import type { IconName, SearchModel, SearchResult } from "metabase-types/api";

import type { DashboardContentItem } from "../utils";

export type DashboardContentDetails = {
  lastEditedAt?: string | null;
  lastEditedBy?: string | null;
  location?: { name: string; icon: IconName } | null;
};

const SEARCH_MODELS = new Set<string>([
  "card",
  "dataset",
  "metric",
  "dashboard",
  "collection",
  "table",
  "document",
] satisfies SearchModel[]);

const isSearchModel = (model: string): model is SearchModel =>
  SEARCH_MODELS.has(model);

/**
 * Dashcards don't carry who last edited their cards or where those cards are
 * saved, so look the items up in search. Search only filters by id within a
 * single model, so this makes one request per model.
 */
export function useContentsDetails(contents: DashboardContentItem[]) {
  const dispatch = useDispatch();
  const [details, setDetails] = useState(
    () => new Map<string, DashboardContentDetails>(),
  );

  const idsByModel = useMemo(() => {
    const map = new Map<SearchModel, number[]>();
    contents.forEach(({ model, entityId }) => {
      if (isSearchModel(model)) {
        map.set(model, [...(map.get(model) ?? []), entityId]);
      }
    });
    return map;
  }, [contents]);

  useEffect(() => {
    let isCancelled = false;

    const requests = [...idsByModel].map(([model, ids]) =>
      dispatch(
        searchApi.endpoints.search.initiate(
          {
            models: [model],
            ids,
            context: "library",
            include_dashboard_questions: true,
          },
          { subscribe: false },
        ),
      )
        .unwrap()
        .then((response) => response.data)
        .catch(() => []),
    );

    Promise.all(requests).then((responses) => {
      if (!isCancelled) {
        setDetails(
          new Map(
            responses
              .flat()
              .map((result) => [
                `${result.model}:${result.id}`,
                getDetails(result),
              ]),
          ),
        );
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [dispatch, idsByModel]);

  return details;
}

function getDetails(result: SearchResult): DashboardContentDetails {
  return {
    lastEditedAt: result.last_edited_at ?? result.updated_at,
    lastEditedBy: result.last_editor_common_name,
    location: getLocation(result),
  };
}

function getLocation(
  result: SearchResult,
): DashboardContentDetails["location"] {
  if (result.dashboard) {
    return { name: result.dashboard.name, icon: "dashboard" };
  }
  if (result.model === "table") {
    return result.database_name
      ? { name: result.database_name, icon: "database" }
      : null;
  }
  if (result.collection) {
    return {
      name: result.collection.name ?? t`Our analytics`,
      icon: getCollectionIcon(result.collection).name,
    };
  }
  return null;
}
