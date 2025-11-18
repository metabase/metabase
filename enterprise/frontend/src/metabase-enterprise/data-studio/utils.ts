import { match } from "ts-pattern";

import { skipToken, useListCollectionItemsQuery } from "metabase/api";
import type { MiniPickerCollectionItem } from "metabase/common/components/Pickers/MiniPicker/types";
import { getIsEmbeddingIframe } from "metabase/selectors/embed";
import { getUserIsAdmin } from "metabase/selectors/user";
import { useGetLibraryCollectionQuery } from "metabase-enterprise/api";
import type { State } from "metabase-types/store";

export function canAccessDataStudio(state: State) {
  return getUserIsAdmin(state) && !getIsEmbeddingIframe(state);
}

export const useGetLibraryCollection = () => {
  const { data: libraryCollection, isLoading: isLoadingCollection } =
    useGetLibraryCollectionQuery();
  const hasStuff = Boolean(
    libraryCollection && libraryCollection?.below?.length,
  );
  const { data: libraryItems, isLoading: isLoadingItems } =
    useListCollectionItemsQuery(
      libraryCollection && hasStuff ? { id: libraryCollection.id } : skipToken,
    );

  const subcollectionsWithStuff =
    libraryItems?.data.filter(
      (item) =>
        item.model === "collection" &&
        (item.here?.length || item.below?.length),
    ) ?? [];

  const showableLibrary = match({ subcollectionsWithStuff, hasStuff })
    .when(
      // if there's only one subcollection with stuff, we want to go straight into it
      ({ subcollectionsWithStuff }) => subcollectionsWithStuff?.length === 1,
      () => subcollectionsWithStuff[0],
    )
    .with(
      { hasStuff: true },
      () => libraryCollection as MiniPickerCollectionItem,
    )
    .otherwise(() => undefined);

  return {
    isLoading: isLoadingCollection || isLoadingItems,
    data: showableLibrary,
  };
};
