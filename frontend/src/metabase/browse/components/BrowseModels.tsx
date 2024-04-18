import { t } from "ttag";

import NoResults from "assets/img/no_results.svg";
import ItemsTable from "metabase/collections/components/ItemsTable";
import type { useSearchListQuery } from "metabase/common/hooks";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import Search from "metabase/entities/search";
import { useDispatch } from "metabase/lib/redux";
import { Box, Stack } from "metabase/ui";
import type { SearchResult } from "metabase-types/api";

import { CenteredEmptyState } from "./BrowseApp.styled";
import { ModelExplanationBanner } from "./ModelExplanationBanner";
import type { SortingOptions } from "metabase/collections/components/BaseItemsTable";

export const BrowseModels = ({
  modelsResult,
}: {
  modelsResult: ReturnType<typeof useSearchListQuery<SearchResult>>;
}) => {
  const { data: models = [], error, isLoading } = modelsResult;

  /// dead code, delenda est
  /// const locale = useSelector(getLocale);
  /// const localeCode: string | undefined = locale?.code;
  /// const [collectionViewPreferences, setCollectionViewPreferences] = useState(
  ///   getCollectionViewPreferences,
  /// );

  const dispatch = useDispatch();

  if (error || isLoading) {
    return (
      <LoadingAndErrorWrapper
        error={error}
        loading={isLoading}
        style={{ display: "flex", flex: 1 }}
      />
    );
  }

  /// dead code, delenda est
  /// const handleToggleCollectionExpand = (collectionId: CollectionId) => {
  ///   const newPreferences = {
  ///     ...collectionViewPreferences,
  ///     [collectionId]: {
  ///       expanded: !(
  ///         collectionViewPreferences?.[collectionId]?.expanded ?? true
  ///       ),
  ///       showAll: !!collectionViewPreferences?.[collectionId]?.showAll,
  ///     },
  ///   };
  ///   setCollectionViewPreferences(newPreferences);
  ///   localStorage.setItem(
  ///     BROWSE_MODELS_LOCALSTORAGE_KEY,
  ///     JSON.stringify(newPreferences),
  ///   );
  /// };

  /// dead code, delenda est
  /// const handleToggleCollectionShowAll = (collectionId: CollectionId) => {
  ///   const newPreferences = {
  ///     ...collectionViewPreferences,
  ///     [collectionId]: {
  ///       expanded: collectionViewPreferences?.[collectionId]?.expanded ?? true,
  ///       showAll: !collectionViewPreferences?.[collectionId]?.showAll,
  ///     },
  ///   };
  ///   setCollectionViewPreferences(newPreferences);
  ///   localStorage.setItem(
  ///     BROWSE_MODELS_LOCALSTORAGE_KEY,
  ///     JSON.stringify(newPreferences),
  ///   );
  /// };
  /// const groupsOfModels = groupModels(models, localeCode);

  const sortingOptions: SortingOptions = {
    sort_column: "name",
    sort_direction: "asc",
  };
  const wrappedModels = models.map(model => Search.wrapEntity(model, dispatch));
  const handleUnpinnedItemsSortingChange = (
    newSortingOptions: SortingOptions,
  ) => {
    // TODO: Implement sorting
  };

  if (models.length) {
    return (
      <Stack spacing="md">
        <ModelExplanationBanner />
        <ItemsTable
          items={wrappedModels}
          sortingOptions={sortingOptions}
          onSortingOptionsChange={handleUnpinnedItemsSortingChange}
          // databases={databases}
          // bookmarks={bookmarks}
          // createBookmark={createBookmark}
          // deleteBookmark={deleteBookmark}
          // collection={collection}
          // selectedItems={selected}
          // hasUnselected={hasUnselected}
          // getIsSelected={getIsSelected}
          // onToggleSelected={toggleItem}
          // onDrop={clear}
          // onMove={handleMove}
          // onCopy={handleCopy}
          // onSelectAll={handleSelectAll}
          // onSelectNone={clear}
        />
      </Stack>
    );
  }

  return (
    <CenteredEmptyState
      title={<Box mb=".5rem">{t`No models here yet`}</Box>}
      message={
        <Box maw="24rem">{t`Models help curate data to make it easier to find answers to questions all in one place.`}</Box>
      }
      illustrationElement={
        <Box mb=".5rem">
          <img src={NoResults} />
        </Box>
      }
    />
  );
};
