import { useInteractiveQuestionContext } from "embedding-sdk/components/public/InteractiveQuestion/context";
import { FilterContent } from "metabase/querying/components/FilterContent";
import { useFilterContent } from "metabase/querying/components/FilterModal";
import { Stack } from "metabase/ui";

export const Filter = () => {
  const { question, onQueryChange, setIsFilterOpen } =
    useInteractiveQuestionContext();

  const {
    query,
    version,
    isChanged,
    tab,
    setTab,
    canRemoveFilters,
    searchText,
    isSearching,
    visibleItems,
    handleInput,
    handleChange,
    handleReset,
    handleSubmit,
    handleSearch,
  } = useFilterContent(question.query(), onQueryChange);

  const onApplyFilters = () => {
    setIsFilterOpen(false);
    handleSubmit();
  };

  return (
    <Stack>
      <button onClick={() => setIsFilterOpen(false)}>Close</button>
      <FilterContent.Header value={searchText} onChange={handleSearch} />
      <FilterContent.Body
        groupItems={visibleItems}
        query={query}
        tab={tab}
        version={version}
        searching={isSearching}
        onChange={handleChange}
        onInput={handleInput}
        onTabChange={setTab}
      />
      <FilterContent.Footer
        canRemoveFilters={canRemoveFilters}
        onClearFilters={handleReset}
        isChanged={isChanged}
        onApplyFilters={onApplyFilters}
      />
    </Stack>
  );
};
