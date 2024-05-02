import { useListRecentItemsQuery } from "metabase/api";
import { DelayedLoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { Box, Text } from "metabase/ui";
import type { SearchModel } from "metabase-types/api";

import { getIcon } from "../utils";

import { ModelCard } from "./ModelCard";
import { RecentlyViewedModelsGrid } from "./RecentlyViewedModels.styled";

// TODO:
// Make 'A model' general
// Why 'Recents' and not 'Recently viewed'?
// Is the table clearly *not* under the 'Recents' header?
// Do we want more than five recently viewed items? 5 is hard-coded but looks easy to change
// Do we still want the model explanation banner? Maybe it could be an icon with a tooltip next to Models
// Too many model icons?
// It says 'Browse data' on the left but 'Databases' in the header - mismatch?

export const RecentlyViewedModels = () => {
  const {
    data: recentItems = [],
    error,
    isLoading,
  } = useListRecentItemsQuery(undefined, { refetchOnMountOrArgChange: true });

  return (
    <>
      <RecentlyViewedModelsHeader />
      <DelayedLoadingAndErrorWrapper
        error={error}
        loading={isLoading}
        blankComponent={<Box mih="129px" />}
      >
        <RecentlyViewedModelsGrid>
          {recentItems.map(item => {
            const { model_object: model, model_id } = item;
            const modelWithId = {
              ...model,
              model: "dataset" as SearchModel,
              id: model_id,
            };
            return (
              <ModelCard
                model={modelWithId}
                icon={getIcon(modelWithId)}
                key={`${item.model}-${item.model_id}`}
              />
            );
          })}
        </RecentlyViewedModelsGrid>
      </DelayedLoadingAndErrorWrapper>
    </>
  );
};

export const RecentlyViewedModelsHeader = () => (
  <Text fw="bold" size={16} color="text-dark">
    Recents
  </Text>
);
