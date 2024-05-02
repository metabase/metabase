import { useMemo, useState } from "react";
import _ from "underscore";

import { useSearchQuery } from "metabase/api";
import type { SortingOptions } from "metabase/components/ItemsTable/BaseItemsTable";
import Search from "metabase/entities/search";
import { useDispatch } from "metabase/lib/redux";
import { PLUGIN_CONTENT_VERIFICATION } from "metabase/plugins";
import { Stack } from "metabase/ui";
import type {
  CollectionEssentials,
  CollectionItem,
  SearchRequest,
} from "metabase-types/api";
import { SortDirection } from "metabase-types/api";

import { filterModels, type ActualModelFilters } from "../utils";

import { ModelExplanationBanner } from "./ModelExplanationBanner";
import { ModelsTable } from "./ModelsTable";
import { RecentlyViewedModels } from "./RecentlyViewedModels";
import { getCollectionPathString } from "./utils";

const { availableModelFilters } = PLUGIN_CONTENT_VERIFICATION;

export const BrowseModelsBody = ({
  actualModelFilters,
}: {
  actualModelFilters: ActualModelFilters;
}) => {
  const dispatch = useDispatch();
  const [sortingOptions, setSortingOptions] = useState<SortingOptions>({
    sort_column: "name",
    sort_direction: SortDirection.Asc,
  });

  const query: SearchRequest = {
    models: ["dataset"], // 'model' in the sense of 'type of thing'
    model_ancestors: true,
    filter_items_in_personal_collection: "exclude",
  };

  const { data, error, isLoading } = useSearchQuery(query);
  const unfilteredModels = useMemo(() => data?.data, [data]);

  const filteredModels = useMemo(
    () =>
      unfilteredModels
        ? filterModels(
            unfilteredModels,
            actualModelFilters,
            availableModelFilters,
          )
        : undefined,
    [unfilteredModels, actualModelFilters],
  );

  const sortedModels = useMemo(() => {
    if (!filteredModels) {
      return undefined;
    }
    const { sort_column, sort_direction } = sortingOptions;
    const sorted = _.sortBy(filteredModels, model => {
      if (sort_column === "collection") {
        const collection: CollectionEssentials = model.collection;
        return getCollectionPathString(collection);
      }
      if (sort_column in model) {
        return model[sort_column as keyof typeof model];
      } else {
        console.error("Invalid sort column", sort_column);
        return null;
      }
    });
    if (sort_direction === SortDirection.Desc) {
      sorted.reverse();
    }
    return sorted;
  }, [filteredModels, sortingOptions]);

  const wrappedModels = useMemo(() => {
    return sortedModels?.map(
      model => Search.wrapEntity(model, dispatch) as CollectionItem,
    );
  }, [sortedModels, dispatch]);

  return (
    <Stack spacing="md" mb="lg">
      <ModelExplanationBanner />
      <RecentlyViewedModels />
      <ModelsTable
        items={wrappedModels}
        sortingOptions={sortingOptions}
        onSortingOptionsChange={setSortingOptions}
        error={error}
        isLoading={isLoading}
      />
    </Stack>
  );
};
